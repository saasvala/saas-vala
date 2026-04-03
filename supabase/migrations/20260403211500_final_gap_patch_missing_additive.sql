-- FINAL GAP PATCH (additive only)
-- Adds missing compatibility items without altering existing flow.

-- 1) Feature flags compatibility columns
ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS feature_name TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT;

UPDATE public.feature_flags
SET
  feature_name = COALESCE(feature_name, name, flag_key),
  role = COALESCE(role, 'all')
WHERE feature_name IS NULL OR role IS NULL;

-- 2) Role permissions compatibility table (module/action granularity)
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role, module, action)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_module
  ON public.role_permissions(role, module);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'role_permissions'
      AND policyname = 'Super admin full access role_permissions'
  ) THEN
    CREATE POLICY "Super admin full access role_permissions"
      ON public.role_permissions
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'role_permissions'
      AND policyname = 'Authenticated can view role_permissions'
  ) THEN
    CREATE POLICY "Authenticated can view role_permissions"
      ON public.role_permissions
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.role_permission_map') IS NOT NULL
     AND to_regclass('public.permissions') IS NOT NULL THEN
    INSERT INTO public.role_permissions(role, module, action, allowed)
    SELECT rpm.role, p.module, p.action, COALESCE(rpm.granted, true)
    FROM public.role_permission_map rpm
    JOIN public.permissions p ON p.id = rpm.permission_id
    ON CONFLICT (role, module, action)
    DO UPDATE SET
      allowed = EXCLUDED.allowed,
      updated_at = now();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_role_permissions_updated_at'
  ) THEN
    CREATE TRIGGER update_role_permissions_updated_at
    BEFORE UPDATE ON public.role_permissions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 3) Session management compatibility table
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT,
  location TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consent_given BOOLEAN DEFAULT false,
  consent_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active
  ON public.user_sessions(user_id, is_active, created_at DESC);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sessions'
      AND policyname = 'Users view own sessions'
  ) THEN
    CREATE POLICY "Users view own sessions"
      ON public.user_sessions
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sessions'
      AND policyname = 'Users revoke own sessions'
  ) THEN
    CREATE POLICY "Users revoke own sessions"
      ON public.user_sessions
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_sessions'
      AND policyname = 'Super admin full access user_sessions'
  ) THEN
    CREATE POLICY "Super admin full access user_sessions"
      ON public.user_sessions
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_sessions_updated_at'
  ) THEN
    CREATE TRIGGER update_user_sessions_updated_at
    BEFORE UPDATE ON public.user_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
