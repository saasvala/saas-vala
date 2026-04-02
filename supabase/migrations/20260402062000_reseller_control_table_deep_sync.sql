-- Reseller control table deep sync (additive, no deletion)

-- 1) Align reseller status + verification semantics
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS kyc_status TEXT;

UPDATE public.resellers
SET kyc_status = CASE
  WHEN COALESCE(is_verified, false) = true THEN 'verified'
  ELSE 'pending'
END
WHERE kyc_status IS NULL;

ALTER TABLE public.resellers
  ALTER COLUMN kyc_status SET DEFAULT 'pending',
  ALTER COLUMN kyc_status SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resellers_kyc_status_check'
  ) THEN
    ALTER TABLE public.resellers
      ADD CONSTRAINT resellers_kyc_status_check
      CHECK (kyc_status IN ('pending', 'verified', 'rejected'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resellers_commission_non_negative'
  ) THEN
    ALTER TABLE public.resellers
      ADD CONSTRAINT resellers_commission_non_negative
      CHECK (COALESCE(commission_percent, 0) >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resellers_credit_limit_non_negative'
  ) THEN
    ALTER TABLE public.resellers
      ADD CONSTRAINT resellers_credit_limit_non_negative
      CHECK (COALESCE(credit_limit, 0) >= 0);
  END IF;
END $$;

-- keep backward-compatible is_verified in sync with kyc_status
CREATE OR REPLACE FUNCTION public.sync_reseller_verification_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kyc_status IS DISTINCT FROM OLD.kyc_status THEN
    NEW.is_verified := (NEW.kyc_status = 'verified');
  ELSIF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN
    NEW.kyc_status := CASE WHEN COALESCE(NEW.is_verified, false) THEN 'verified' ELSE 'pending' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reseller_verification_flags ON public.resellers;
CREATE TRIGGER trg_sync_reseller_verification_flags
  BEFORE UPDATE ON public.resellers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_reseller_verification_flags();

-- 2) Performance indexes for aggregate queries
CREATE INDEX IF NOT EXISTS idx_orders_reseller_id_created_at
  ON public.orders (reseller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_reseller_id_status_created_at
  ON public.orders (reseller_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reseller_commission_logs_reseller_status_created
  ON public.reseller_commission_logs (reseller_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_license_keys_reseller_created
  ON public.license_keys (reseller_id, created_at DESC);

-- 3) Realtime-safe aggregate sync: resellers.total_sales + total_commission
CREATE OR REPLACE FUNCTION public.refresh_reseller_totals(p_reseller_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_sales numeric := 0;
  v_commission numeric := 0;
BEGIN
  IF p_reseller_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(o.amount), 0)
  INTO v_sales
  FROM public.orders o
  WHERE o.reseller_id = p_reseller_id
    AND o.status = 'success';

  SELECT COALESCE(SUM(c.amount), 0)
  INTO v_commission
  FROM public.reseller_commission_logs c
  WHERE c.reseller_id = p_reseller_id
    AND c.status IN ('credited', 'withdrawn');

  UPDATE public.resellers
  SET total_sales = ROUND(v_sales::numeric, 2),
      total_commission = ROUND(v_commission::numeric, 2),
      updated_at = now()
  WHERE id = p_reseller_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_reseller_totals_from_orders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_reseller_totals(COALESCE(NEW.reseller_id, OLD.reseller_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_reseller_totals_from_orders ON public.orders;
CREATE TRIGGER trg_refresh_reseller_totals_from_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_reseller_totals_from_orders();

CREATE OR REPLACE FUNCTION public.trg_refresh_reseller_totals_from_commissions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_reseller_totals(COALESCE(NEW.reseller_id, OLD.reseller_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_reseller_totals_from_commissions ON public.reseller_commission_logs;
CREATE TRIGGER trg_refresh_reseller_totals_from_commissions
  AFTER INSERT OR UPDATE OR DELETE ON public.reseller_commission_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_reseller_totals_from_commissions();

-- 4) Audit trail events (reseller_joined, approved, suspended, sales_made)
CREATE OR REPLACE FUNCTION public.audit_reseller_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.audit_action := 'update';
  v_event text := 'reseller_updated';
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_event := 'reseller_joined';
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.status, CASE WHEN COALESCE(OLD.is_active, true) THEN 'active' ELSE 'suspended' END)
       IS DISTINCT FROM COALESCE(NEW.status, CASE WHEN COALESCE(NEW.is_active, true) THEN 'active' ELSE 'suspended' END) THEN
      IF COALESCE(NEW.status, CASE WHEN COALESCE(NEW.is_active, true) THEN 'active' ELSE 'suspended' END) = 'suspended' THEN
        v_action := 'suspend';
        v_event := 'suspended';
      ELSIF COALESCE(NEW.status, CASE WHEN COALESCE(NEW.is_active, true) THEN 'active' ELSE 'suspended' END) = 'active' THEN
        v_action := 'activate';
        v_event := 'approved';
      END IF;
    ELSIF COALESCE(OLD.kyc_status, 'pending') IS DISTINCT FROM COALESCE(NEW.kyc_status, 'pending')
      AND NEW.kyc_status = 'verified' THEN
      v_action := 'update';
      v_event := 'approved';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    v_action,
    'resellers',
    NEW.id,
    to_jsonb(OLD),
    jsonb_set(to_jsonb(NEW), '{event}', to_jsonb(v_event), true)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_reseller_events ON public.resellers;
CREATE TRIGGER trg_audit_reseller_events
  AFTER INSERT OR UPDATE ON public.resellers
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_reseller_events();

CREATE OR REPLACE FUNCTION public.audit_reseller_sale_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reseller_id uuid;
BEGIN
  v_reseller_id := COALESCE(NEW.reseller_id, OLD.reseller_id);
  IF v_reseller_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'success' THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
    VALUES (
      auth.uid(),
      'create',
      'orders',
      NEW.id,
      jsonb_build_object(
        'event', 'sales_made',
        'reseller_id', NEW.reseller_id,
        'amount', NEW.amount,
        'currency', NEW.currency
      )
    );
  ELSIF TG_OP = 'UPDATE' AND COALESCE(OLD.status, '') IS DISTINCT FROM COALESCE(NEW.status, '') AND NEW.status = 'success' THEN
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (
      auth.uid(),
      'update',
      'orders',
      NEW.id,
      to_jsonb(OLD),
      jsonb_build_object(
        'event', 'sales_made',
        'reseller_id', NEW.reseller_id,
        'amount', NEW.amount,
        'currency', NEW.currency
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_reseller_sale_events ON public.orders;
CREATE TRIGGER trg_audit_reseller_sale_events
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_reseller_sale_events();

-- 5) Backfill current totals once
UPDATE public.resellers r
SET total_sales = COALESCE((
      SELECT ROUND(COALESCE(SUM(o.amount), 0)::numeric, 2)
      FROM public.orders o
      WHERE o.reseller_id = r.id
        AND o.status = 'success'
    ), 0),
    total_commission = COALESCE((
      SELECT ROUND(COALESCE(SUM(c.amount), 0)::numeric, 2)
      FROM public.reseller_commission_logs c
      WHERE c.reseller_id = r.id
        AND c.status IN ('credited', 'withdrawn')
    ), 0);
