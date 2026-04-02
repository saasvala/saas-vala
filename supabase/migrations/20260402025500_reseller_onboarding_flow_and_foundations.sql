-- Reseller onboarding flow + foundational extension tables

-- 1) Reseller applications
CREATE TABLE IF NOT EXISTS public.reseller_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  contact TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reseller_applications_user_id
  ON public.reseller_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_reseller_applications_status_created_at
  ON public.reseller_applications(status, created_at DESC);

ALTER TABLE public.reseller_applications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reseller_applications'
      AND policyname = 'Users can create own reseller application'
  ) THEN
    CREATE POLICY "Users can create own reseller application"
    ON public.reseller_applications
    FOR INSERT
    WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reseller_applications'
      AND policyname = 'Users can view own reseller applications'
  ) THEN
    CREATE POLICY "Users can view own reseller applications"
    ON public.reseller_applications
    FOR SELECT
    USING (user_id = auth.uid());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'reseller_applications'
      AND policyname = 'Super admin full access reseller applications'
  ) THEN
    CREATE POLICY "Super admin full access reseller applications"
    ON public.reseller_applications
    FOR ALL
    USING (public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'update_reseller_applications_updated_at'
    ) THEN
      CREATE TRIGGER update_reseller_applications_updated_at
      BEFORE UPDATE ON public.reseller_applications
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;

-- 2) Resellers table alignment (tier + status)
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'resellers_status_check'
  ) THEN
    ALTER TABLE public.resellers
      ADD CONSTRAINT resellers_status_check
      CHECK (status IN ('active', 'suspended', 'pending', 'inactive'));
  END IF;
END $$;

-- 3) Feature flags + A/B testing hooks
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL UNIQUE,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_percent INTEGER NOT NULL DEFAULT 100 CHECK (rollout_percent >= 0 AND rollout_percent <= 100),
  targeting_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ab_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_key TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed')),
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  traffic_percent INTEGER NOT NULL DEFAULT 100 CHECK (traffic_percent >= 0 AND traffic_percent <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ab_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.ab_experiments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, user_id, session_id)
);

-- 4) GDPR/data export-delete requests
CREATE TABLE IF NOT EXISTS public.gdpr_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('export', 'delete')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  notes TEXT,
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_requests_user_status
  ON public.gdpr_requests(user_id, status);

-- 5) Notification system foundation (email/sms)
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  template_key TEXT,
  recipient TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_status_scheduled
  ON public.notification_outbox(status, scheduled_at);

-- 6) Webhook foundation
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  events TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_code INTEGER,
  response_body TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status_created
  ON public.webhook_deliveries(status, created_at DESC);

-- 7) API versioning registry
CREATE TABLE IF NOT EXISTS public.api_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_deprecated BOOLEAN NOT NULL DEFAULT false,
  docs_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8) Fraud detection rule metadata
CREATE TABLE IF NOT EXISTS public.fraud_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9) Analytics events + search index support
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_category TEXT,
  source_module TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
  ON public.analytics_events(event_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.search_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT,
  content TEXT,
  searchable tsvector,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_search_documents_searchable
  ON public.search_documents
  USING GIN(searchable);

-- 10) Session/device management + 2FA
CREATE TABLE IF NOT EXISTS public.user_2fa_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  method TEXT NOT NULL DEFAULT 'totp' CHECK (method IN ('totp', 'sms')),
  secret_encrypted TEXT,
  backup_codes_encrypted JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11) SLA + uptime tracking + throttled cron scheduling
CREATE TABLE IF NOT EXISTS public.sla_uptime_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('up', 'down', 'degraded')),
  response_time_ms INTEGER,
  uptime_percent NUMERIC(5,2),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sla_uptime_checks_service_checked_at
  ON public.sla_uptime_checks(service_name, checked_at DESC);

CREATE TABLE IF NOT EXISTS public.cron_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key TEXT NOT NULL UNIQUE,
  cron_expression TEXT NOT NULL,
  max_runs_per_hour INTEGER NOT NULL DEFAULT 60,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

