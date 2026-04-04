-- Builder micro-flow additive schema: architecture + dedicated queues

CREATE TABLE IF NOT EXISTS public.project_architecture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  db JSONB NOT NULL DEFAULT '{}'::jsonb,
  erd JSONB NOT NULL DEFAULT '{}'::jsonb,
  apis JSONB NOT NULL DEFAULT '[]'::jsonb,
  routes JSONB NOT NULL DEFAULT '[]'::jsonb,
  trace_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_architecture_project_id
  ON public.project_architecture(project_id);

CREATE INDEX IF NOT EXISTS idx_project_architecture_trace_id
  ON public.project_architecture(trace_id);

CREATE TABLE IF NOT EXISTS public.debug_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  trace_id UUID,
  source_step TEXT NOT NULL DEFAULT 'run_debug',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'success', 'failed', 'dead_letter')),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 10),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debug_queue_project_status_created
  ON public.debug_queue(project_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.deploy_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  trace_id UUID,
  source_step TEXT NOT NULL DEFAULT 'deploy',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'success', 'failed', 'dead_letter')),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 10),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deploy_queue_project_status_created
  ON public.deploy_queue(project_id, status, created_at DESC);
