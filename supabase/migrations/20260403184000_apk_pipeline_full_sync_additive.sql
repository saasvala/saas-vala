-- APK pipeline ↔ product ↔ marketplace full sync (additive)

-- 1) Extend apk_builds for unified build tracking
ALTER TABLE public.apk_builds
  ADD COLUMN IF NOT EXISTS build_id UUID,
  ADD COLUMN IF NOT EXISTS build_status TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

UPDATE public.apk_builds
SET build_id = COALESCE(build_id, id)
WHERE build_id IS NULL;

UPDATE public.apk_builds
SET build_status = CASE
  WHEN LOWER(COALESCE(status, '')) IN ('completed', 'published', 'ready', 'success', 'distributed', 'stored', 'signed') THEN 'success'
  WHEN LOWER(COALESCE(status, '')) IN ('failed', 'error') THEN 'failed'
  ELSE 'pending'
END
WHERE build_status IS NULL;

UPDATE public.apk_builds
SET source = 'pipeline'
WHERE source IS NULL;

ALTER TABLE public.apk_builds
  ALTER COLUMN build_id SET NOT NULL,
  ALTER COLUMN build_status SET NOT NULL,
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN build_status SET DEFAULT 'pending',
  ALTER COLUMN source SET DEFAULT 'pipeline';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'apk_builds_build_status_valid'
      AND conrelid = 'public.apk_builds'::regclass
  ) THEN
    ALTER TABLE public.apk_builds
      ADD CONSTRAINT apk_builds_build_status_valid
      CHECK (build_status IN ('pending', 'success', 'failed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'apk_builds_source_valid'
      AND conrelid = 'public.apk_builds'::regclass
  ) THEN
    ALTER TABLE public.apk_builds
      ADD CONSTRAINT apk_builds_source_valid
      CHECK (source IN ('manual', 'pipeline'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_apk_builds_build_id_unique
  ON public.apk_builds(build_id);

CREATE INDEX IF NOT EXISTS idx_apk_builds_product_build_status_created_at
  ON public.apk_builds(product_id, build_status, created_at DESC);

-- 2) Extend products for build sync state
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS build_id UUID,
  ADD COLUMN IF NOT EXISTS build_status TEXT;

UPDATE public.products
SET build_status = CASE
  WHEN COALESCE(apk_url, '') <> '' THEN 'success'
  ELSE 'pending'
END
WHERE build_status IS NULL;

ALTER TABLE public.products
  ALTER COLUMN build_status SET DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_build_status_valid'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_build_status_valid
      CHECK (build_status IS NULL OR build_status IN ('pending', 'success', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_build_status
  ON public.products(build_status);

CREATE INDEX IF NOT EXISTS idx_products_build_id
  ON public.products(build_id);
