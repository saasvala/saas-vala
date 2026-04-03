-- AUTO PILOT MODULE — ULTRA CORE (additive, non-destructive)

-- 1) client_requests: required Ultra Core fields
ALTER TABLE public.client_requests
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS budget NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS features_required TEXT,
  ADD COLUMN IF NOT EXISTS ai_score INTEGER,
  ADD COLUMN IF NOT EXISTS assigned_to TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_requests_status_ultra_check'
      AND conrelid = 'public.client_requests'::regclass
  ) THEN
    ALTER TABLE public.client_requests
      ADD CONSTRAINT client_requests_status_ultra_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'in_progress', 'completed', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_requests_created_at ON public.client_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_requests_business_country ON public.client_requests(business_type, country);

-- Backfill additive fields from existing columns when possible
UPDATE public.client_requests
SET
  name = COALESCE(name, client_name),
  features_required = COALESCE(features_required, request_details)
WHERE name IS NULL OR features_required IS NULL;

-- 2) build_queue (required queue_system)
CREATE TABLE IF NOT EXISTS public.build_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'web' CHECK (type IN ('apk', 'web')),
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  logs TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 10),
  source_request_id UUID REFERENCES public.client_requests(id) ON DELETE SET NULL,
  product_id UUID,
  version TEXT,
  duplicate_fingerprint TEXT,
  failure_reason TEXT,
  failure_detected_by_ai BOOLEAN NOT NULL DEFAULT false,
  rollback_version TEXT,
  deployed_servers JSONB NOT NULL DEFAULT '[]'::jsonb,
  load_balancer_target TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_build_queue_status_priority ON public.build_queue(status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_build_queue_duplicate_fingerprint ON public.build_queue(duplicate_fingerprint);
CREATE INDEX IF NOT EXISTS idx_build_queue_product_version ON public.build_queue(product_id, version);

-- 3) auto_products (required for generate_daily_software)
CREATE TABLE IF NOT EXISTS public.auto_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT NOT NULL,
  niche TEXT NOT NULL,
  generated_by TEXT NOT NULL DEFAULT 'AI',
  repo_url TEXT,
  deploy_url TEXT,
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'queued', 'building', 'deployed', 'failed', 'paused')),
  revenue_prediction NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_products_created_at ON public.auto_products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_products_status ON public.auto_products(status);

-- 4) billing_items and billing_logs
CREATE TABLE IF NOT EXISTS public.billing_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  service_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paid', 'paused', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_items_user_id ON public.billing_items(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_items_created_at ON public.billing_items(created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scanned' CHECK (status IN ('scanned', 'alerted', 'notified', 'auto_deducted', 'paused', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_logs_user_id_created_at ON public.billing_logs(user_id, created_at DESC);

-- 5) apk_builds
CREATE TABLE IF NOT EXISTS public.apk_builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID,
  version TEXT NOT NULL,
  apk_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'building', 'signed', 'stored', 'distributed', 'failed')),
  install_count INTEGER NOT NULL DEFAULT 0 CHECK (install_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apk_builds_product_version ON public.apk_builds(product_id, version);
CREATE INDEX IF NOT EXISTS idx_apk_builds_status ON public.apk_builds(status);

-- 6) system_health
CREATE TABLE IF NOT EXISTS public.system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down', 'unknown')),
  response_time INTEGER,
  last_checked TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_health_module_last_checked ON public.system_health(module_name, last_checked DESC);

-- 7) audit_logs additive compatibility required by spec
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS module TEXT,
  ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_audit_logs_module_timestamp ON public.audit_logs(module, "timestamp" DESC);

