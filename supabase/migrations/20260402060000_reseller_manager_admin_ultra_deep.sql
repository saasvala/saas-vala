-- Reseller manager admin lifecycle hardening

-- 1) Extend resellers with credit tracking + KYC state
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS credit_used DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'pending';

DO $$
BEGIN
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

-- 2) Validation constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resellers_commission_percent_range'
  ) THEN
    ALTER TABLE public.resellers
      ADD CONSTRAINT resellers_commission_percent_range
      CHECK (commission_percent >= 0 AND commission_percent <= 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resellers_credit_limit_non_negative'
  ) THEN
    ALTER TABLE public.resellers
      ADD CONSTRAINT resellers_credit_limit_non_negative
      CHECK (credit_limit >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resellers_credit_used_non_negative'
  ) THEN
    ALTER TABLE public.resellers
      ADD CONSTRAINT resellers_credit_used_non_negative
      CHECK (credit_used >= 0);
  END IF;
END $$;

-- 3) Reseller limits table
CREATE TABLE IF NOT EXISTS public.reseller_limits (
  reseller_id UUID PRIMARY KEY REFERENCES public.resellers(id) ON DELETE CASCADE,
  max_keys INTEGER NOT NULL DEFAULT 0 CHECK (max_keys >= 0),
  max_clients INTEGER NOT NULL DEFAULT 0 CHECK (max_clients >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reseller_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reseller_limits'
      AND policyname = 'Super admin full access reseller_limits'
  ) THEN
    CREATE POLICY "Super admin full access reseller_limits"
    ON public.reseller_limits
    FOR ALL
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'update_reseller_limits_updated_at'
    ) THEN
      CREATE TRIGGER update_reseller_limits_updated_at
      BEFORE UPDATE ON public.reseller_limits
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;
