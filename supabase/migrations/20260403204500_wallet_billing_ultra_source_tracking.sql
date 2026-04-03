-- Wallet & Billing ultra source tracking (additive only)

-- wallets compatibility extensions
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'reseller', 'user')),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended'));

-- transactions source tracking extensions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source_id TEXT;

-- normalize source to requested enum set where possible
DO $$
BEGIN
  UPDATE public.transactions
  SET source = CASE
    WHEN source IN ('upi','card','crypto','bank','wallet','admin') THEN source
    WHEN source IN ('bank_transfer','wise','remit','remitly') THEN 'bank'
    ELSE source
  END
  WHERE source IS NOT NULL;
EXCEPTION
  WHEN undefined_column THEN
    NULL;
END $$;

-- payment sources table
CREATE TABLE IF NOT EXISTS public.payment_sources (
  source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('upi', 'card', 'crypto', 'bank')),
  provider TEXT NOT NULL,
  details_masked TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_sources_user_created ON public.payment_sources(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_sources_type_status ON public.payment_sources(type, status);

ALTER TABLE public.payment_sources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='payment_sources' AND policyname='Users can view own payment sources'
  ) THEN
    CREATE POLICY "Users can view own payment sources"
      ON public.payment_sources
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='payment_sources' AND policyname='Users can insert own payment sources'
  ) THEN
    CREATE POLICY "Users can insert own payment sources"
      ON public.payment_sources
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='payment_sources' AND policyname='Super admin full access payment sources'
  ) THEN
    CREATE POLICY "Super admin full access payment sources"
      ON public.payment_sources
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

-- agreements table
CREATE TABLE IF NOT EXISTS public.agreements (
  agreement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated', 'draft')),
  file_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agreements_user_created ON public.agreements(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agreements_status ON public.agreements(status);

ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='agreements' AND policyname='Users can view own agreements'
  ) THEN
    CREATE POLICY "Users can view own agreements"
      ON public.agreements
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='agreements' AND policyname='Users can insert own agreements'
  ) THEN
    CREATE POLICY "Users can insert own agreements"
      ON public.agreements
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='agreements' AND policyname='Super admin full access agreements'
  ) THEN
    CREATE POLICY "Super admin full access agreements"
      ON public.agreements
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;
