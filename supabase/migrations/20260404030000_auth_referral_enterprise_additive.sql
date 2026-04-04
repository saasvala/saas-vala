-- Enterprise auth + referral additive hardening (no destructive changes)

-- 1) Referral click tracking for anti-fraud
CREATE TABLE IF NOT EXISTS public.referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  ip TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_code_created_at
  ON public.referral_clicks(code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_ip_created_at
  ON public.referral_clicks(ip, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_clicks_device_created_at
  ON public.referral_clicks(device, created_at DESC);

ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referral_clicks'
      AND policyname = 'System can manage referral clicks'
  ) THEN
    CREATE POLICY "System can manage referral clicks"
      ON public.referral_clicks
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- 2) User security ledger (lockouts and password metadata)
CREATE TABLE IF NOT EXISTS public.user_security (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash TEXT,
  last_changed_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  lock_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_password_history_user_created
  ON public.user_password_history(user_id, created_at DESC);

ALTER TABLE public.user_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_password_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_security'
      AND policyname = 'Users can view own security settings'
  ) THEN
    CREATE POLICY "Users can view own security settings"
      ON public.user_security
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_security'
      AND policyname = 'System can manage user security'
  ) THEN
    CREATE POLICY "System can manage user security"
      ON public.user_security
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_password_history'
      AND policyname = 'System can manage password history'
  ) THEN
    CREATE POLICY "System can manage password history"
      ON public.user_password_history
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_security_updated_at') THEN
      CREATE TRIGGER update_user_security_updated_at
      BEFORE UPDATE ON public.user_security
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;

-- 3) OAuth account mapping (Google auto login mapping)
CREATE TABLE IF NOT EXISTS public.oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_provider
  ON public.oauth_accounts(user_id, provider);

ALTER TABLE public.oauth_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'oauth_accounts'
      AND policyname = 'Users can view own oauth accounts'
  ) THEN
    CREATE POLICY "Users can view own oauth accounts"
      ON public.oauth_accounts
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'oauth_accounts'
      AND policyname = 'System can manage oauth accounts'
  ) THEN
    CREATE POLICY "System can manage oauth accounts"
      ON public.oauth_accounts
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_oauth_accounts_updated_at') THEN
      CREATE TRIGGER update_oauth_accounts_updated_at
      BEFORE UPDATE ON public.oauth_accounts
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;

-- 4) Compatibility views requested by external integrations
CREATE OR REPLACE VIEW public.user_2fa AS
SELECT
  user_id,
  secret_encrypted AS secret,
  is_enabled AS enabled,
  backup_codes_encrypted AS backup_codes
FROM public.user_2fa_settings;

CREATE OR REPLACE VIEW public.sessions AS
SELECT
  id,
  user_id,
  COALESCE(device_type, 'unknown') AS device,
  ip_address AS ip,
  session_token AS token,
  COALESCE(revoked_at, now() + interval '30 days') AS expires_at
FROM public.user_sessions;
