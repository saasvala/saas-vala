-- AI Gateway Ultra Hardening (additive, non-destructive)

-- 1) ai_logs compatibility columns for full trace records
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS prompt TEXT;
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS tokens INTEGER;
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS cost NUMERIC(12,6) NOT NULL DEFAULT 0;
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS latency INTEGER;
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'success';
ALTER TABLE public.ai_logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_ai_logs_user_created ON public.ai_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_model_created ON public.ai_logs(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_status_created ON public.ai_logs(status, created_at DESC);

-- 2) ai_memory
CREATE TABLE IF NOT EXISTS public.ai_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_memory_user_unique ON public.ai_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_memory_updated ON public.ai_memory(updated_at DESC);

-- 3) ai queues (chat/code/seo)
CREATE TABLE IF NOT EXISTS public.ai_chat_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  model_type TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'queued',
  prompt TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_code_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  model_type TEXT NOT NULL DEFAULT 'code',
  status TEXT NOT NULL DEFAULT 'queued',
  prompt TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_seo_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  model_type TEXT NOT NULL DEFAULT 'seo',
  status TEXT NOT NULL DEFAULT 'queued',
  prompt TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_queue_status_created ON public.ai_chat_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_code_queue_status_created ON public.ai_code_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_seo_queue_status_created ON public.ai_seo_queue(status, created_at DESC);

-- 4) ai gateway cache
CREATE TABLE IF NOT EXISTS public.ai_gateway_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_hash TEXT NOT NULL,
  model_key TEXT NOT NULL,
  response_text TEXT,
  response_payload JSONB,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost NUMERIC(12,6) NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_gateway_cache_prompt_model_unique
  ON public.ai_gateway_cache(prompt_hash, model_key);
CREATE INDEX IF NOT EXISTS idx_ai_gateway_cache_expires ON public.ai_gateway_cache(expires_at);

-- 5) ai circuit breakers
-- provider expected values: openai, gemini, claude, local_model
CREATE TABLE IF NOT EXISTS public.ai_circuit_breakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'closed',
  failure_count INTEGER NOT NULL DEFAULT 0,
  threshold INTEGER NOT NULL DEFAULT 3,
  cool_off_seconds INTEGER NOT NULL DEFAULT 60,
  open_until TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6) ai gateway minute limits (request + token)
CREATE TABLE IF NOT EXISTS public.ai_gateway_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL DEFAULT 'ai/gateway',
  requests_count INTEGER NOT NULL DEFAULT 0,
  tokens_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_seconds INTEGER NOT NULL DEFAULT 60,
  max_requests INTEGER NOT NULL DEFAULT 30,
  max_tokens INTEGER NOT NULL DEFAULT 120000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_gateway_limits_user_endpoint_window
  ON public.ai_gateway_limits(user_id, endpoint, window_start DESC);
