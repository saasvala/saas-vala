-- Reseller Phase 1 foundation (additive only)

-- -----------------------------
-- reseller clients
-- -----------------------------
CREATE TABLE IF NOT EXISTS public.reseller_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE CASCADE NOT NULL,
  client_email TEXT NOT NULL,
  client_name TEXT,
  client_phone TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  total_spent DECIMAL(12,2) NOT NULL DEFAULT 0,
  last_purchase_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reseller_clients_unique
  ON public.reseller_clients (reseller_id, client_email);

CREATE INDEX IF NOT EXISTS idx_reseller_clients_reseller_status
  ON public.reseller_clients (reseller_id, status);

DROP TRIGGER IF EXISTS trg_reseller_clients_updated_at ON public.reseller_clients;
CREATE TRIGGER trg_reseller_clients_updated_at
  BEFORE UPDATE ON public.reseller_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------
-- referral codes + tracking
-- -----------------------------
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL UNIQUE,
  primary_code BOOLEAN NOT NULL DEFAULT false,
  referred_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'converted')),
  commission_earned DECIMAL(12,2) NOT NULL DEFAULT 0,
  signup_at TIMESTAMPTZ,
  purchase_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_primary_per_reseller
  ON public.referral_codes (reseller_id)
  WHERE primary_code = true;

CREATE INDEX IF NOT EXISTS idx_referral_codes_reseller_status
  ON public.referral_codes (reseller_id, status);

DROP TRIGGER IF EXISTS trg_referral_codes_updated_at ON public.referral_codes;
CREATE TRIGGER trg_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------
-- reseller KYC documents
-- -----------------------------
CREATE TABLE IF NOT EXISTS public.reseller_kyc_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE CASCADE NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('pan', 'aadhaar', 'gstin', 'bank_statement', 'other')),
  document_url TEXT NOT NULL,
  file_hash TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'verified', 'rejected')),
  rejection_reason TEXT,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reseller_kyc_documents_reseller_status
  ON public.reseller_kyc_documents (reseller_id, status);

DROP TRIGGER IF EXISTS trg_reseller_kyc_documents_updated_at ON public.reseller_kyc_documents;
CREATE TRIGGER trg_reseller_kyc_documents_updated_at
  BEFORE UPDATE ON public.reseller_kyc_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------
-- RLS + policies
-- -----------------------------
ALTER TABLE public.reseller_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_kyc_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='reseller_clients' AND policyname='Resellers can view own clients'
  ) THEN
    CREATE POLICY "Resellers can view own clients"
      ON public.reseller_clients
      FOR SELECT
      USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='reseller_clients' AND policyname='Resellers can upsert own clients'
  ) THEN
    CREATE POLICY "Resellers can upsert own clients"
      ON public.reseller_clients
      FOR ALL
      USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()))
      WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='referral_codes' AND policyname='Resellers can manage own referral codes'
  ) THEN
    CREATE POLICY "Resellers can manage own referral codes"
      ON public.referral_codes
      FOR ALL
      USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()))
      WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='reseller_kyc_documents' AND policyname='Resellers can manage own kyc docs'
  ) THEN
    CREATE POLICY "Resellers can manage own kyc docs"
      ON public.reseller_kyc_documents
      FOR ALL
      USING (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()))
      WITH CHECK (reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='reseller_clients' AND policyname='Super admin full access reseller_clients'
  ) THEN
    CREATE POLICY "Super admin full access reseller_clients"
      ON public.reseller_clients
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='referral_codes' AND policyname='Super admin full access referral_codes'
  ) THEN
    CREATE POLICY "Super admin full access referral_codes"
      ON public.referral_codes
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='reseller_kyc_documents' AND policyname='Super admin full access reseller_kyc_documents'
  ) THEN
    CREATE POLICY "Super admin full access reseller_kyc_documents"
      ON public.reseller_kyc_documents
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;
