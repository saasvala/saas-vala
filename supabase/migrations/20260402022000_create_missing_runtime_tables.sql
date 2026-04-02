-- Create missing runtime tables referenced by app and edge functions

-- Ensure foundational helpers exist when this migration runs standalone
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = _role
  )
$$;

-- activity_logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_performed_by ON public.activity_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_logs' AND policyname = 'Users can view own activity logs'
  ) THEN
    CREATE POLICY "Users can view own activity logs"
    ON public.activity_logs
    FOR SELECT
    USING (performed_by = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_logs' AND policyname = 'System can insert activity logs'
  ) THEN
    CREATE POLICY "System can insert activity logs"
    ON public.activity_logs
    FOR INSERT
    WITH CHECK (performed_by = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'activity_logs' AND policyname = 'Super admin full access activity logs'
  ) THEN
    CREATE POLICY "Super admin full access activity logs"
    ON public.activity_logs
    FOR ALL
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

-- apk_versions
CREATE TABLE IF NOT EXISTS public.apk_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apk_id UUID NOT NULL REFERENCES public.apks(id) ON DELETE CASCADE,
  version_name TEXT NOT NULL,
  version_code INTEGER NOT NULL CHECK (version_code > 0),
  release_notes TEXT,
  file_path TEXT,
  file_size BIGINT CHECK (file_size IS NULL OR file_size >= 0),
  checksum TEXT,
  is_stable BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (apk_id, version_code)
);

CREATE INDEX IF NOT EXISTS idx_apk_versions_apk_id_created_at ON public.apk_versions(apk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apk_versions_created_by ON public.apk_versions(created_by);

ALTER TABLE public.apk_versions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_versions' AND policyname = 'Authenticated users can read apk versions'
  ) THEN
    CREATE POLICY "Authenticated users can read apk versions"
    ON public.apk_versions
    FOR SELECT
    USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_versions' AND policyname = 'Owners can manage own apk versions'
  ) THEN
    CREATE POLICY "Owners can manage own apk versions"
    ON public.apk_versions
    FOR ALL
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_versions' AND policyname = 'Super admin full access apk versions'
  ) THEN
    CREATE POLICY "Super admin full access apk versions"
    ON public.apk_versions
    FOR ALL
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

-- invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  customer_address TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_percent NUMERIC(5,2) DEFAULT 0 CHECK (tax_percent >= 0),
  tax_amount NUMERIC(12,2) DEFAULT 0 CHECK (tax_amount >= 0),
  discount_percent NUMERIC(5,2) DEFAULT 0 CHECK (discount_percent >= 0),
  discount_amount NUMERIC(12,2) DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'draft',
  due_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  terms TEXT,
  signature_data TEXT,
  signed_at TIMESTAMP WITH TIME ZONE,
  signer_ip INET,
  otp_verified BOOLEAN DEFAULT false,
  otp_verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices(created_at DESC);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'Users can view own invoices'
  ) THEN
    CREATE POLICY "Users can view own invoices"
    ON public.invoices
    FOR SELECT
    USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'Users can create own invoices'
  ) THEN
    CREATE POLICY "Users can create own invoices"
    ON public.invoices
    FOR INSERT
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'Users can update own invoices'
  ) THEN
    CREATE POLICY "Users can update own invoices"
    ON public.invoices
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'Users can delete own invoices'
  ) THEN
    CREATE POLICY "Users can delete own invoices"
    ON public.invoices
    FOR DELETE
    USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoices' AND policyname = 'Super admin full access invoices'
  ) THEN
    CREATE POLICY "Super admin full access invoices"
    ON public.invoices
    FOR ALL
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

-- invoice_otp_codes
CREATE TABLE IF NOT EXISTS public.invoice_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  otp_code TEXT NOT NULL,
  email TEXT NOT NULL,
  verified BOOLEAN DEFAULT false,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_otp_codes_invoice_id ON public.invoice_otp_codes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_otp_codes_email ON public.invoice_otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_invoice_otp_codes_expires_at ON public.invoice_otp_codes(expires_at);

ALTER TABLE public.invoice_otp_codes ENABLE ROW LEVEL SECURITY;

-- Keep compatibility with existing security migrations by creating expected policies if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoice_otp_codes' AND policyname = 'Invoice owner can view OTP codes'
  ) THEN
    CREATE POLICY "Invoice owner can view OTP codes"
    ON public.invoice_otp_codes
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.invoices
        WHERE invoices.id = invoice_otp_codes.invoice_id
          AND invoices.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoice_otp_codes' AND policyname = 'Invoice owner can create OTP codes'
  ) THEN
    CREATE POLICY "Invoice owner can create OTP codes"
    ON public.invoice_otp_codes
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.invoices
        WHERE invoices.id = invoice_otp_codes.invoice_id
          AND invoices.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoice_otp_codes' AND policyname = 'Invoice owner can update OTP codes'
  ) THEN
    CREATE POLICY "Invoice owner can update OTP codes"
    ON public.invoice_otp_codes
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.invoices
        WHERE invoices.id = invoice_otp_codes.invoice_id
          AND invoices.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoice_otp_codes' AND policyname = 'Invoice owner can delete OTP codes'
  ) THEN
    CREATE POLICY "Invoice owner can delete OTP codes"
    ON public.invoice_otp_codes
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.invoices
        WHERE invoices.id = invoice_otp_codes.invoice_id
          AND invoices.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoice_otp_codes' AND policyname = 'Valid OTP codes can be verified'
  ) THEN
    CREATE POLICY "Valid OTP codes can be verified"
    ON public.invoice_otp_codes
    FOR SELECT
    USING (expires_at > now());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoice_otp_codes' AND policyname = 'Valid OTP codes can be updated for verification'
  ) THEN
    CREATE POLICY "Valid OTP codes can be updated for verification"
    ON public.invoice_otp_codes
    FOR UPDATE
    USING (expires_at > now());
  END IF;
END $$;

-- updated_at trigger alignment for invoices
DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
