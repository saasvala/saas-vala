-- Marketplace manager final micro patch (additive only)

-- APK versions compatibility columns for upload API contract
ALTER TABLE public.apk_versions
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS version TEXT,
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS size BIGINT,
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('processing', 'active', 'failed', 'archived')),
  ADD COLUMN IF NOT EXISTS changelog TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

UPDATE public.apk_versions
SET
  version = COALESCE(version, version_name),
  file_url = COALESCE(file_url, file_path),
  size = COALESCE(size, file_size),
  changelog = COALESCE(changelog, release_notes),
  status = COALESCE(status, CASE WHEN is_stable THEN 'active' ELSE 'processing' END),
  product_id = COALESCE(
    product_id,
    (
      SELECT a.product_id
      FROM public.apks a
      WHERE a.id = apk_versions.apk_id
      LIMIT 1
    )
  )
WHERE
  version IS NULL
  OR file_url IS NULL
  OR size IS NULL
  OR status IS NULL
  OR product_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_apk_versions_product_id_created
  ON public.apk_versions(product_id, created_at DESC);

-- Pipeline queue compatibility table
CREATE TABLE IF NOT EXISTS public.apk_pipeline_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apk_id UUID REFERENCES public.apks(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'scanning', 'fixing', 'ready', 'failed')),
  source_queue_id UUID REFERENCES public.apk_build_queue(id) ON DELETE SET NULL,
  trace_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apk_pipeline_queue_status_created
  ON public.apk_pipeline_queue(status, created_at DESC);

-- Chunk upload session/parts support (max 50MB chunk, unlimited total by part count)
CREATE TABLE IF NOT EXISTS public.apk_upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  version_code INTEGER NOT NULL CHECK (version_code > 0),
  file_name TEXT NOT NULL,
  file_type TEXT,
  changelog TEXT,
  replace_apk_id UUID REFERENCES public.apks(id) ON DELETE SET NULL,
  total_chunks INTEGER NOT NULL CHECK (total_chunks > 0),
  uploaded_chunks INTEGER NOT NULL DEFAULT 0 CHECK (uploaded_chunks >= 0),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'merging', 'ready', 'failed')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.apk_upload_session_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES public.apk_upload_sessions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  chunk_size BIGINT NOT NULL CHECK (chunk_size >= 0),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (upload_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_apk_upload_sessions_product_status
  ON public.apk_upload_sessions(product_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apk_upload_session_parts_upload_chunk
  ON public.apk_upload_session_parts(upload_id, chunk_index);

-- Download log compatibility table
CREATE TABLE IF NOT EXISTS public.download_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  apk_id UUID REFERENCES public.apks(id) ON DELETE SET NULL,
  ip TEXT,
  device TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_download_logs_user_product_created
  ON public.download_logs(user_id, product_id, created_at DESC);

ALTER TABLE public.apk_download_logs
  ADD COLUMN IF NOT EXISTS apk_id UUID REFERENCES public.apks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ip TEXT,
  ADD COLUMN IF NOT EXISTS device TEXT;

UPDATE public.apk_download_logs
SET
  ip = COALESCE(ip, download_ip),
  device = COALESCE(device, device_id)
WHERE ip IS NULL OR device IS NULL;
