-- Canonical ERD compatibility layer (additive only, no destructive changes)
-- Aligns naming/relationships for sessions, wallet, builder projects, and key ERD links.

-- 1) Canonical sessions view alias over user_sessions
CREATE OR REPLACE VIEW public.sessions AS
SELECT
  us.id,
  us.user_id,
  us.session_token AS token,
  us.device_type AS device,
  us.ip_address AS ip,
  us.expires_at,
  us.created_at,
  us.updated_at
FROM public.user_sessions us;

-- 2) Canonical wallet view alias over wallets
CREATE OR REPLACE VIEW public.wallet AS
SELECT
  w.id,
  w.user_id,
  w.balance,
  w.updated_at,
  w.created_at
FROM public.wallets w;

-- 3) Ensure transactions can be linked to user directly for canonical flow USER -> WALLET -> TRANSACTIONS
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_id_created_at
  ON public.transactions (user_id, created_at DESC);

-- Backfill user_id from wallet owner (idempotent)
UPDATE public.transactions t
SET user_id = w.user_id
FROM public.wallets w
WHERE t.wallet_id = w.id
  AND t.user_id IS NULL;

-- 4) Canonical builder_projects table with link to APK builds/product pipeline
CREATE TABLE IF NOT EXISTS public.builder_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'archived')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_projects_status_created_at
  ON public.builder_projects (status, created_at DESC);

-- 5) Link apk_builds to builder_projects for BUILDER -> APK -> PRODUCT relation
ALTER TABLE public.apk_builds
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.builder_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_apk_builds_project_id
  ON public.apk_builds (project_id);

-- 6) Canonical user ownership column for license_keys (without replacing existing owner fields)
ALTER TABLE public.license_keys
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_license_keys_user_id
  ON public.license_keys (user_id);

-- Backfill from existing owner linkage where available
UPDATE public.license_keys
SET user_id = owner_id
WHERE user_id IS NULL
  AND owner_id IS NOT NULL;

-- 7) Ensure canonical reseller commission field exists
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS commission NUMERIC(5,2);

UPDATE public.resellers
SET commission = commission_percent
WHERE commission IS NULL
  AND commission_percent IS NOT NULL;

-- 8) Add canonical audit module/status fields if missing
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS module TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_module_created_at
  ON public.audit_logs (module, created_at DESC);

-- 9) Canonical category level hardening index for macro/sub/micro navigation
CREATE INDEX IF NOT EXISTS idx_categories_parent_level
  ON public.categories (parent_id, level);

-- 10) Guard rails for core flow indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_created_at
  ON public.orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_order_status_created_at
  ON public.payments (order_id, status, created_at DESC);
