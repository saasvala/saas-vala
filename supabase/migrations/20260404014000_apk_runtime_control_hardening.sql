-- APK runtime control + governance + queue hardening (additive)

-- 1) Version governance extensions
ALTER TABLE public.apk_versions
  ADD COLUMN IF NOT EXISTS release_channel TEXT NOT NULL DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS min_supported_version_code INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS force_update BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rollout_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS build_target TEXT NOT NULL DEFAULT 'apk',
  ADD COLUMN IF NOT EXISTS hash_algorithm TEXT NOT NULL DEFAULT 'sha256',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_apk_versions_apk_rollout
  ON public.apk_versions(apk_id, rollout_status, created_at DESC);

-- 2) Product-level runtime policy controls
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_supported_apk_version_code INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS force_update_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apk_kill_switch BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apk_kill_reason TEXT,
  ADD COLUMN IF NOT EXISTS current_stable_apk_version_id UUID REFERENCES public.apk_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_stable_apk_path TEXT,
  ADD COLUMN IF NOT EXISTS current_stable_apk_checksum TEXT;

-- 3) License runtime sync controls
ALTER TABLE public.license_keys
  ADD COLUMN IF NOT EXISTS offline_grace_hours INTEGER NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS last_policy_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS runtime_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS runtime_block_reason TEXT;

-- 4) Build queue controls (priority, resources, multi-target)
ALTER TABLE public.apk_build_queue
  ADD COLUMN IF NOT EXISTS priority_tier TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS priority_score INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS resource_class TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS build_target TEXT NOT NULL DEFAULT 'apk',
  ADD COLUMN IF NOT EXISTS artifact_checksum TEXT,
  ADD COLUMN IF NOT EXISTS artifact_checksum_algorithm TEXT NOT NULL DEFAULT 'sha256',
  ADD COLUMN IF NOT EXISTS previous_stable_apk_path TEXT,
  ADD COLUMN IF NOT EXISTS rollback_status TEXT NOT NULL DEFAULT 'none';

CREATE INDEX IF NOT EXISTS idx_apk_build_queue_priority
  ON public.apk_build_queue(build_status, priority_score DESC, created_at ASC);

-- 5) Download tracking extensions
ALTER TABLE public.apk_download_logs
  ADD COLUMN IF NOT EXISTS download_origin TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS geo_region TEXT;

-- 6) Runtime policy verification logs (signed policy events)
CREATE TABLE IF NOT EXISTS public.apk_runtime_policy_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT NOT NULL,
  user_id UUID,
  product_id TEXT,
  device_id TEXT,
  app_version_code INTEGER,
  app_hash TEXT,
  policy_status TEXT NOT NULL,
  update_mode TEXT,
  blocked BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  response_signature TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.apk_runtime_policy_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_runtime_policy_logs' AND policyname = 'Super admin full access runtime policy logs'
  ) THEN
    CREATE POLICY "Super admin full access runtime policy logs"
    ON public.apk_runtime_policy_logs
    FOR ALL
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_runtime_policy_logs' AND policyname = 'Users view own runtime policy logs'
  ) THEN
    CREATE POLICY "Users view own runtime policy logs"
    ON public.apk_runtime_policy_logs
    FOR SELECT
    USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_runtime_policy_logs' AND policyname = 'System can insert runtime policy logs'
  ) THEN
    CREATE POLICY "System can insert runtime policy logs"
    ON public.apk_runtime_policy_logs
    FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;

-- 7) APK app-usage analytics table
CREATE TABLE IF NOT EXISTS public.apk_usage_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_key TEXT NOT NULL,
  user_id UUID,
  product_id TEXT,
  device_id TEXT,
  app_version_code INTEGER,
  event_type TEXT NOT NULL,
  event_name TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apk_usage_analytics_license_created
  ON public.apk_usage_analytics(license_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apk_usage_analytics_event_created
  ON public.apk_usage_analytics(event_type, created_at DESC);

ALTER TABLE public.apk_usage_analytics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_usage_analytics' AND policyname = 'Super admin full access apk usage analytics'
  ) THEN
    CREATE POLICY "Super admin full access apk usage analytics"
    ON public.apk_usage_analytics
    FOR ALL
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_usage_analytics' AND policyname = 'Users view own apk usage analytics'
  ) THEN
    CREATE POLICY "Users view own apk usage analytics"
    ON public.apk_usage_analytics
    FOR SELECT
    USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_usage_analytics' AND policyname = 'System can insert apk usage analytics'
  ) THEN
    CREATE POLICY "System can insert apk usage analytics"
    ON public.apk_usage_analytics
    FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;
