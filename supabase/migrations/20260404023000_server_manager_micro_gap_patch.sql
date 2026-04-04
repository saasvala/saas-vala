-- Server manager micro gap patch (additive, non-destructive)

CREATE TABLE IF NOT EXISTS public.server_health_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  cpu_usage NUMERIC(5,2),
  ram_usage NUMERIC(5,2),
  disk_usage NUMERIC(5,2),
  uptime BIGINT,
  status TEXT NOT NULL DEFAULT 'unknown',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.server_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('cpu', 'downtime', 'security')),
  level TEXT NOT NULL CHECK (level IN ('low', 'medium', 'critical')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.server_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('scan', 'deploy', 'fix')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'failed', 'done')),
  logs TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  usage_limit INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.server_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL UNIQUE REFERENCES public.servers(id) ON DELETE CASCADE,
  username TEXT,
  password_encrypted TEXT,
  ssh_key_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS event TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'webhooks' AND column_name = 'event_type'
  ) THEN
    EXECUTE 'UPDATE public.webhooks SET event = COALESCE(event, event_type) WHERE event IS NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_server_health_metrics_server_id
  ON public.server_health_metrics(server_id);
CREATE INDEX IF NOT EXISTS idx_server_health_metrics_status
  ON public.server_health_metrics(status);
CREATE INDEX IF NOT EXISTS idx_server_alerts_server_id
  ON public.server_alerts(server_id);
CREATE INDEX IF NOT EXISTS idx_server_alerts_status
  ON public.server_alerts(status);
CREATE INDEX IF NOT EXISTS idx_server_jobs_server_id
  ON public.server_jobs(server_id);
CREATE INDEX IF NOT EXISTS idx_server_jobs_status
  ON public.server_jobs(status);

ALTER TABLE public.server_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_credentials ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='server_health_metrics' AND policyname='Authenticated can read server_health_metrics'
  ) THEN
    CREATE POLICY "Authenticated can read server_health_metrics"
      ON public.server_health_metrics
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='server_alerts' AND policyname='Authenticated can read server_alerts'
  ) THEN
    CREATE POLICY "Authenticated can read server_alerts"
      ON public.server_alerts
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='server_jobs' AND policyname='Authenticated can read server_jobs'
  ) THEN
    CREATE POLICY "Authenticated can read server_jobs"
      ON public.server_jobs
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='api_keys' AND policyname='Super admin full access api_keys'
  ) THEN
    CREATE POLICY "Super admin full access api_keys"
      ON public.api_keys
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='server_credentials' AND policyname='Super admin full access server_credentials'
  ) THEN
    CREATE POLICY "Super admin full access server_credentials"
      ON public.server_credentials
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;
