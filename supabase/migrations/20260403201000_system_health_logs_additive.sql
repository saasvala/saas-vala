CREATE TABLE IF NOT EXISTS public.system_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('healthy', 'warning', 'error')),
  response_time INTEGER NOT NULL DEFAULT 0 CHECK (response_time >= 0),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_health_logs_module_checked_at
  ON public.system_health_logs (module, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_health_logs_status_checked_at
  ON public.system_health_logs (status, checked_at DESC);
