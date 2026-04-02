-- Final reseller gaps + ultra layer feature controls (additive)

ALTER TABLE public.reseller_applications
  ADD COLUMN IF NOT EXISTS features_checklist JSONB,
  ADD COLUMN IF NOT EXISTS terms_version TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.reseller_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'application_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_reseller_feature_flags_reseller_enabled
  ON public.reseller_feature_flags (reseller_id, enabled, feature_key);

CREATE TABLE IF NOT EXISTS public.reseller_terms_acceptance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES public.reseller_applications(id) ON DELETE SET NULL,
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL,
  reseller_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  terms_version TEXT NOT NULL DEFAULT 'v1',
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_reseller_terms_acceptance_logs_user_accepted_at
  ON public.reseller_terms_acceptance_logs (reseller_user_id, accepted_at DESC);

ALTER TABLE public.reseller_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_terms_acceptance_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reseller_feature_flags'
      AND policyname = 'Super admin full access reseller_feature_flags'
  ) THEN
    CREATE POLICY "Super admin full access reseller_feature_flags"
    ON public.reseller_feature_flags
    FOR ALL
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reseller_feature_flags'
      AND policyname = 'Reseller can view own feature flags'
  ) THEN
    CREATE POLICY "Reseller can view own feature flags"
    ON public.reseller_feature_flags
    FOR SELECT
    USING (
      reseller_id IN (
        SELECT id FROM public.resellers WHERE user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reseller_terms_acceptance_logs'
      AND policyname = 'Super admin full access reseller_terms_acceptance_logs'
  ) THEN
    CREATE POLICY "Super admin full access reseller_terms_acceptance_logs"
    ON public.reseller_terms_acceptance_logs
    FOR ALL
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reseller_terms_acceptance_logs'
      AND policyname = 'Reseller can view own terms acceptance logs'
  ) THEN
    CREATE POLICY "Reseller can view own terms acceptance logs"
    ON public.reseller_terms_acceptance_logs
    FOR SELECT
    USING (reseller_user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'update_reseller_feature_flags_updated_at'
    ) THEN
      CREATE TRIGGER update_reseller_feature_flags_updated_at
      BEFORE UPDATE ON public.reseller_feature_flags
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;
