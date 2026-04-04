-- APK ultra pipeline additive schema
-- Non-destructive only

ALTER TABLE public.apk_build_queue
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS stage_artifacts JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS failure_type TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retries INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_provider TEXT,
  ADD COLUMN IF NOT EXISTS ai_fallback_used BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS security_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS scan_report JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS apk_metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS license_metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS upload_metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS marketplace_metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS build_manifest JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

UPDATE public.apk_build_queue
SET
  pipeline_stage = COALESCE(pipeline_stage, 'queued'),
  stage_artifacts = COALESCE(stage_artifacts, '{}'::jsonb),
  retry_count = COALESCE(retry_count, 0),
  max_retries = COALESCE(max_retries, 3),
  ai_fallback_used = COALESCE(ai_fallback_used, false),
  security_status = COALESCE(security_status, 'pending'),
  scan_report = COALESCE(scan_report, '{}'::jsonb),
  apk_metadata = COALESCE(apk_metadata, '{}'::jsonb),
  license_metadata = COALESCE(license_metadata, '{}'::jsonb),
  upload_metadata = COALESCE(upload_metadata, '{}'::jsonb),
  marketplace_metadata = COALESCE(marketplace_metadata, '{}'::jsonb),
  build_manifest = COALESCE(build_manifest, '{}'::jsonb)
WHERE
  pipeline_stage IS NULL
  OR stage_artifacts IS NULL
  OR retry_count IS NULL
  OR max_retries IS NULL
  OR ai_fallback_used IS NULL
  OR security_status IS NULL
  OR scan_report IS NULL
  OR apk_metadata IS NULL
  OR license_metadata IS NULL
  OR upload_metadata IS NULL
  OR marketplace_metadata IS NULL
  OR build_manifest IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'apk_build_queue_pipeline_stage_check'
  ) THEN
    ALTER TABLE public.apk_build_queue
      ADD CONSTRAINT apk_build_queue_pipeline_stage_check
      CHECK (
        pipeline_stage IN (
          'queued',
          'ingesting',
          'analyzing',
          'fixing',
          'scanning',
          'building',
          'signing',
          'licensing',
          'uploading',
          'marketplace_sync',
          'ready',
          'failed'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_apk_build_queue_stage_status
  ON public.apk_build_queue (pipeline_stage, build_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apk_build_queue_retry_window
  ON public.apk_build_queue (next_retry_at)
  WHERE build_status IN ('pending', 'retrying', 'building');
CREATE INDEX IF NOT EXISTS idx_apk_build_queue_locked_at
  ON public.apk_build_queue (locked_at)
  WHERE locked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_apk_build_queue_trace_id
  ON public.apk_build_queue (trace_id)
  WHERE trace_id IS NOT NULL;

ALTER TABLE public.apk_downloads
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS offline_cache_token TEXT,
  ADD COLUMN IF NOT EXISTS offline_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trace_id TEXT;

CREATE INDEX IF NOT EXISTS idx_apk_downloads_device_id
  ON public.apk_downloads (device_id)
  WHERE device_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_apk_downloads_trace_id
  ON public.apk_downloads (trace_id)
  WHERE trace_id IS NOT NULL;

ALTER TABLE public.license_verification_logs
  ADD COLUMN IF NOT EXISTS trace_id TEXT;

ALTER TABLE public.apk_download_logs
  ADD COLUMN IF NOT EXISTS trace_id TEXT,
  ADD COLUMN IF NOT EXISTS result TEXT;

ALTER TABLE public.apk_versions
  ADD COLUMN IF NOT EXISTS signing_cert_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.apk_security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_queue_id UUID REFERENCES public.apk_build_queue(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  trace_id TEXT,
  scan_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed', 'blocked')),
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apk_security_scans_slug_scanned
  ON public.apk_security_scans (slug, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_apk_security_scans_trace_id
  ON public.apk_security_scans (trace_id)
  WHERE trace_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.apk_pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_queue_id UUID REFERENCES public.apk_build_queue(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  trace_id TEXT,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apk_pipeline_events_trace_id
  ON public.apk_pipeline_events (trace_id)
  WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_apk_pipeline_events_slug_created
  ON public.apk_pipeline_events (slug, created_at DESC);

ALTER TABLE public.apk_security_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apk_pipeline_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='apk_security_scans' AND policyname='Super admin full access apk_security_scans'
  ) THEN
    CREATE POLICY "Super admin full access apk_security_scans"
      ON public.apk_security_scans
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='apk_security_scans' AND policyname='Authenticated read apk_security_scans'
  ) THEN
    CREATE POLICY "Authenticated read apk_security_scans"
      ON public.apk_security_scans
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='apk_pipeline_events' AND policyname='Super admin full access apk_pipeline_events'
  ) THEN
    CREATE POLICY "Super admin full access apk_pipeline_events"
      ON public.apk_pipeline_events
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='apk_pipeline_events' AND policyname='Authenticated read apk_pipeline_events'
  ) THEN
    CREATE POLICY "Authenticated read apk_pipeline_events"
      ON public.apk_pipeline_events
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
