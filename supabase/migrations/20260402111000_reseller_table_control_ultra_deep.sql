-- Reseller table + control logic ultra deep (additive, no deletion)

-- 1) Reseller governance fields
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resellers_commission_percent_non_negative'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.resellers
      ADD CONSTRAINT resellers_commission_percent_non_negative
      CHECK (commission_percent IS NULL OR commission_percent >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resellers_credit_limit_non_negative'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.resellers
      ADD CONSTRAINT resellers_credit_limit_non_negative
      CHECK (credit_limit IS NULL OR credit_limit >= 0);
  END IF;
END $$;

-- 2) Order/commission aggregates for list table + consistency
CREATE OR REPLACE FUNCTION public.sync_reseller_totals_from_orders(_reseller_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_sales NUMERIC := 0;
  v_total_commission NUMERIC := 0;
BEGIN
  IF _reseller_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_sales
  FROM public.orders
  WHERE reseller_id = _reseller_id
    AND status = 'success';

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_commission
  FROM public.reseller_commission_logs
  WHERE reseller_id = _reseller_id;

  UPDATE public.resellers
  SET total_sales = ROUND(v_total_sales::numeric, 2),
      total_commission = ROUND(v_total_commission::numeric, 2),
      updated_at = now()
  WHERE id = _reseller_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_reseller_totals_on_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_reseller_totals_from_orders(COALESCE(NEW.reseller_id, OLD.reseller_id));
  IF NEW.reseller_id IS DISTINCT FROM OLD.reseller_id THEN
    PERFORM public.sync_reseller_totals_from_orders(OLD.reseller_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reseller_totals_orders ON public.orders;
CREATE TRIGGER trg_sync_reseller_totals_orders
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_reseller_totals_on_order_change();

CREATE OR REPLACE FUNCTION public.handle_reseller_totals_on_commission_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_reseller_totals_from_orders(COALESCE(NEW.reseller_id, OLD.reseller_id));
  IF NEW.reseller_id IS DISTINCT FROM OLD.reseller_id THEN
    PERFORM public.sync_reseller_totals_from_orders(OLD.reseller_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reseller_totals_commission ON public.reseller_commission_logs;
CREATE TRIGGER trg_sync_reseller_totals_commission
AFTER INSERT OR UPDATE OR DELETE ON public.reseller_commission_logs
FOR EACH ROW
EXECUTE FUNCTION public.handle_reseller_totals_on_commission_change();

-- 3) Status global lock + KYC payout guard
CREATE OR REPLACE FUNCTION public.enforce_reseller_status_and_kyc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reseller RECORD;
BEGIN
  IF NEW.reseller_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, status, is_active, kyc_status
  INTO v_reseller
  FROM public.resellers
  WHERE id = NEW.reseller_id;

  IF v_reseller.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_reseller.status, 'active') <> 'active' OR COALESCE(v_reseller.is_active, true) = false THEN
    RAISE EXCEPTION 'RESELLER_SUSPENDED'
      USING ERRCODE = '23514', HINT = 'Reseller is suspended/inactive';
  END IF;

  IF TG_TABLE_NAME = 'marketplace_payouts'
     AND TG_OP IN ('INSERT', 'UPDATE')
     AND COALESCE(NEW.status, '') IN ('processing', 'completed')
     AND COALESCE(v_reseller.kyc_status, 'pending') <> 'verified' THEN
    RAISE EXCEPTION 'RESELLER_KYC_NOT_VERIFIED'
      USING ERRCODE = '23514', HINT = 'Payout requires verified KYC';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_reseller_status_orders ON public.orders;
CREATE TRIGGER trg_enforce_reseller_status_orders
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_reseller_status_and_kyc();

DROP TRIGGER IF EXISTS trg_enforce_reseller_status_keys ON public.license_keys;
CREATE TRIGGER trg_enforce_reseller_status_keys
BEFORE INSERT OR UPDATE ON public.license_keys
FOR EACH ROW
EXECUTE FUNCTION public.enforce_reseller_status_and_kyc();

DROP TRIGGER IF EXISTS trg_enforce_reseller_status_commissions ON public.reseller_commission_logs;
CREATE TRIGGER trg_enforce_reseller_status_commissions
BEFORE INSERT OR UPDATE ON public.reseller_commission_logs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_reseller_status_and_kyc();

DROP TRIGGER IF EXISTS trg_enforce_reseller_status_payouts ON public.marketplace_payouts;
CREATE TRIGGER trg_enforce_reseller_status_payouts
BEFORE INSERT OR UPDATE ON public.marketplace_payouts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_reseller_status_and_kyc();

-- 4) Credit-limit aware wallet check function (for API use + future RLS helpers)
CREATE OR REPLACE FUNCTION public.reseller_wallet_can_debit(_reseller_id UUID, _user_id UUID, _amount NUMERIC)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet RECORD;
  v_reseller RECORD;
  v_available NUMERIC := 0;
  v_limit NUMERIC := 0;
  v_deficit NUMERIC := 0;
BEGIN
  SELECT id, balance, locked_balance
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = _user_id;

  SELECT id, credit_limit, status, is_active
  INTO v_reseller
  FROM public.resellers
  WHERE id = _reseller_id;

  IF v_wallet.id IS NULL OR v_reseller.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MISSING_CONTEXT');
  END IF;

  IF COALESCE(v_reseller.status, 'active') <> 'active' OR COALESCE(v_reseller.is_active, true) = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RESELLER_SUSPENDED');
  END IF;

  v_available := COALESCE(v_wallet.balance, 0) - COALESCE(v_wallet.locked_balance, 0);
  v_limit := COALESCE(v_reseller.credit_limit, 0);

  IF (v_available - COALESCE(_amount, 0)) < (-1 * v_limit) THEN
    v_deficit := ABS((v_available - COALESCE(_amount, 0)) + v_limit);
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CREDIT_LIMIT_EXCEEDED',
      'available', ROUND(v_available::numeric, 2),
      'credit_limit', ROUND(v_limit::numeric, 2),
      'deficit', ROUND(v_deficit::numeric, 2)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'available', ROUND(v_available::numeric, 2),
    'credit_limit', ROUND(v_limit::numeric, 2)
  );
END;
$$;

-- 5) Activity event expansion + indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_action_created
  ON public.activity_logs (entity_type, action, created_at DESC);

-- 6) Aggregation indexes
CREATE INDEX IF NOT EXISTS idx_reseller_commission_logs_reseller_order
  ON public.reseller_commission_logs (reseller_id, order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_license_keys_reseller_created
  ON public.license_keys (reseller_id, created_at DESC);

-- 7) Backfill existing totals
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.resellers LOOP
    PERFORM public.sync_reseller_totals_from_orders(r.id);
  END LOOP;
END $$;
