-- Canonical APK pipeline hardening (additive only)

ALTER TABLE public.apk_build_queue
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_primary_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_fallback_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_model_used TEXT,
  ADD COLUMN IF NOT EXISTS security_scan_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS artifact_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS signed_url_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS queue_name TEXT NOT NULL DEFAULT 'apk_pipeline',
  ADD COLUMN IF NOT EXISTS license_key_id UUID REFERENCES public.license_keys(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS license_key_value TEXT;

UPDATE public.apk_build_queue
SET pipeline_status = CASE
  WHEN lower(coalesce(build_status, '')) IN ('queued', 'pending') THEN 'queued'
  WHEN lower(coalesce(build_status, '')) IN ('building') THEN 'building'
  WHEN lower(coalesce(build_status, '')) IN ('completed', 'ready') THEN 'ready'
  WHEN lower(coalesce(build_status, '')) IN ('blocked') THEN 'blocked'
  WHEN lower(coalesce(build_status, '')) IN ('failed', 'error') THEN 'failed'
  ELSE 'queued'
END
WHERE pipeline_status IS NULL;

UPDATE public.apk_build_queue
SET pipeline_stage = COALESCE(pipeline_stage, pipeline_status, 'queued')
WHERE pipeline_stage IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'apk_build_queue_pipeline_status_valid'
      AND conrelid = 'public.apk_build_queue'::regclass
  ) THEN
    ALTER TABLE public.apk_build_queue
      ADD CONSTRAINT apk_build_queue_pipeline_status_valid
      CHECK (
        pipeline_status IN (
          'queued','analyzing','fixing','scanning','building','signing','licensing','uploading','marketplace','ready','failed','blocked'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_apk_build_queue_pipeline_status_created
  ON public.apk_build_queue(pipeline_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_apk_build_queue_trace_id
  ON public.apk_build_queue(trace_id);

CREATE INDEX IF NOT EXISTS idx_apk_build_queue_locking
  ON public.apk_build_queue(pipeline_status, lock_expires_at, retry_count);

CREATE UNIQUE INDEX IF NOT EXISTS idx_apk_build_queue_idempotency_key
  ON public.apk_build_queue(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.apk_pipeline_stage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.apk_build_queue(id) ON DELETE CASCADE,
  trace_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apk_pipeline_stage_logs_trace_created
  ON public.apk_pipeline_stage_logs(trace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_apk_pipeline_stage_logs_job_stage
  ON public.apk_pipeline_stage_logs(job_id, stage, created_at DESC);

CREATE TABLE IF NOT EXISTS public.apk_ai_decision_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.apk_build_queue(id) ON DELETE CASCADE,
  trace_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  provider TEXT,
  model_primary TEXT,
  model_fallback TEXT,
  model_used TEXT,
  prompt_hash TEXT,
  decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apk_ai_decision_logs_trace_created
  ON public.apk_ai_decision_logs(trace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.apk_security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.apk_build_queue(id) ON DELETE CASCADE,
  trace_id TEXT NOT NULL,
  malware_pass BOOLEAN NOT NULL,
  permission_pass BOOLEAN NOT NULL,
  injection_pass BOOLEAN NOT NULL,
  blocked BOOLEAN NOT NULL DEFAULT false,
  findings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apk_security_scans_trace_created
  ON public.apk_security_scans(trace_id, created_at DESC);

ALTER TABLE public.apk_pipeline_stage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apk_ai_decision_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apk_security_scans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_pipeline_stage_logs' AND policyname = 'Super admin full access apk_pipeline_stage_logs'
  ) THEN
    CREATE POLICY "Super admin full access apk_pipeline_stage_logs"
      ON public.apk_pipeline_stage_logs FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_ai_decision_logs' AND policyname = 'Super admin full access apk_ai_decision_logs'
  ) THEN
    CREATE POLICY "Super admin full access apk_ai_decision_logs"
      ON public.apk_ai_decision_logs FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_security_scans' AND policyname = 'Super admin full access apk_security_scans'
  ) THEN
    CREATE POLICY "Super admin full access apk_security_scans"
      ON public.apk_security_scans FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_pipeline_stage_logs' AND policyname = 'Authenticated users can read apk_pipeline_stage_logs'
  ) THEN
    CREATE POLICY "Authenticated users can read apk_pipeline_stage_logs"
      ON public.apk_pipeline_stage_logs FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_ai_decision_logs' AND policyname = 'Authenticated users can read apk_ai_decision_logs'
  ) THEN
    CREATE POLICY "Authenticated users can read apk_ai_decision_logs"
      ON public.apk_ai_decision_logs FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'apk_security_scans' AND policyname = 'Authenticated users can read apk_security_scans'
  ) THEN
    CREATE POLICY "Authenticated users can read apk_security_scans"
      ON public.apk_security_scans FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
