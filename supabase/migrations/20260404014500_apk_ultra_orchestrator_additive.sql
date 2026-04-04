-- APK ULTRA ORCHESTRATOR additive schema
-- Canonical pipeline job/state tracking + step logs + dead-letter

CREATE TABLE IF NOT EXISTS public.apk_pipeline_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL UNIQUE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  slug TEXT,
  repo_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'analyzing', 'fixing', 'scanning', 'building', 'signing', 'licensing', 'uploading', 'marketplace_sync', 'ready', 'failed')),
  current_step TEXT NOT NULL DEFAULT 'queued',
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_retry INTEGER NOT NULL DEFAULT 3 CHECK (max_retry >= 1 AND max_retry <= 10),
  last_error JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifacts JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_model_used JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage_timestamps JSONB NOT NULL DEFAULT '{}'::jsonb,
  build_log TEXT,
  worker_id TEXT,
  lease_expires_at TIMESTAMPTZ,
  lease_token UUID,
  step_timeout_seconds INTEGER NOT NULL DEFAULT 900 CHECK (step_timeout_seconds > 0),
  next_retry_at TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 100,
  dead_lettered BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'apk_pipeline_jobs_current_step_matches_status'
      AND conrelid = 'public.apk_pipeline_jobs'::regclass
  ) THEN
    ALTER TABLE public.apk_pipeline_jobs
      ADD CONSTRAINT apk_pipeline_jobs_current_step_matches_status
      CHECK (current_step = status);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_apk_pipeline_jobs_status_lease_priority
  ON public.apk_pipeline_jobs(status, lease_expires_at, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_apk_pipeline_jobs_trace_id
  ON public.apk_pipeline_jobs(trace_id);
CREATE INDEX IF NOT EXISTS idx_apk_pipeline_jobs_product_id
  ON public.apk_pipeline_jobs(product_id);
CREATE INDEX IF NOT EXISTS idx_apk_pipeline_jobs_slug
  ON public.apk_pipeline_jobs(slug);
CREATE INDEX IF NOT EXISTS idx_apk_pipeline_jobs_repo_url
  ON public.apk_pipeline_jobs(repo_url);
CREATE INDEX IF NOT EXISTS idx_apk_pipeline_jobs_dead_lettered
  ON public.apk_pipeline_jobs(dead_lettered, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.apk_pipeline_step_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.apk_pipeline_jobs(id) ON DELETE CASCADE,
  trace_id TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'retry', 'failed', 'blocked')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  worker_id TEXT,
  model TEXT,
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apk_pipeline_step_logs_job_id_created
  ON public.apk_pipeline_step_logs(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apk_pipeline_step_logs_trace_step
  ON public.apk_pipeline_step_logs(trace_id, step, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apk_pipeline_step_logs_status
  ON public.apk_pipeline_step_logs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.apk_pipeline_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.apk_pipeline_jobs(id) ON DELETE CASCADE,
  trace_id TEXT NOT NULL,
  step TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apk_pipeline_dead_letters_trace_created
  ON public.apk_pipeline_dead_letters(trace_id, created_at DESC);

ALTER TABLE public.apk_pipeline_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apk_pipeline_step_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apk_pipeline_dead_letters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='apk_pipeline_jobs' AND policyname='Super admin full access apk_pipeline_jobs'
  ) THEN
    CREATE POLICY "Super admin full access apk_pipeline_jobs"
      ON public.apk_pipeline_jobs FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='apk_pipeline_jobs' AND policyname='Authenticated read apk_pipeline_jobs'
  ) THEN
    CREATE POLICY "Authenticated read apk_pipeline_jobs"
      ON public.apk_pipeline_jobs FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='apk_pipeline_step_logs' AND policyname='Super admin full access apk_pipeline_step_logs'
  ) THEN
    CREATE POLICY "Super admin full access apk_pipeline_step_logs"
      ON public.apk_pipeline_step_logs FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='apk_pipeline_step_logs' AND policyname='Authenticated read apk_pipeline_step_logs'
  ) THEN
    CREATE POLICY "Authenticated read apk_pipeline_step_logs"
      ON public.apk_pipeline_step_logs FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='apk_pipeline_dead_letters' AND policyname='Super admin full access apk_pipeline_dead_letters'
  ) THEN
    CREATE POLICY "Super admin full access apk_pipeline_dead_letters"
      ON public.apk_pipeline_dead_letters FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='apk_pipeline_dead_letters' AND policyname='Authenticated read apk_pipeline_dead_letters'
  ) THEN
    CREATE POLICY "Authenticated read apk_pipeline_dead_letters"
      ON public.apk_pipeline_dead_letters FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regproc('public.update_updated_at_column') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_apk_pipeline_jobs_updated_at') THEN
      CREATE TRIGGER trg_apk_pipeline_jobs_updated_at
      BEFORE UPDATE ON public.apk_pipeline_jobs
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;
