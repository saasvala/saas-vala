-- ULTRA GOD MODE v2 micro-control additive layer
-- Non-destructive only: add missing entities, links, policies, and observability consolidation.

-- 1) Global trace table
CREATE TABLE IF NOT EXISTS public.trace_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  module TEXT,
  action TEXT,
  api_endpoint TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_status INTEGER,
  db_queries JSONB NOT NULL DEFAULT '[]'::jsonb,
  execution_time INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trace_logs_trace_id ON public.trace_logs(trace_id);
CREATE INDEX IF NOT EXISTS idx_trace_logs_user_id_created_at ON public.trace_logs(user_id, created_at DESC);

-- 2) Normalized locale/currency/country
CREATE TABLE IF NOT EXISTS public.currencies (
  currency_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  symbol TEXT,
  rate NUMERIC(16,6) NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.countries (
  country_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  currency_id UUID REFERENCES public.currencies(currency_id) ON DELETE SET NULL,
  lang_id TEXT REFERENCES public.languages(code) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES public.countries(country_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lang_id TEXT REFERENCES public.languages(code) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency_id UUID REFERENCES public.currencies(currency_id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES public.countries(country_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lang_id TEXT REFERENCES public.languages(code) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency_id UUID REFERENCES public.currencies(currency_id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES public.countries(country_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lang_id TEXT REFERENCES public.languages(code) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency_id UUID REFERENCES public.currencies(currency_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_geo_locale_currency ON public.users(country_id, lang_id, currency_id);
CREATE INDEX IF NOT EXISTS idx_products_geo_locale_currency ON public.products(country_id, lang_id, currency_id);
CREATE INDEX IF NOT EXISTS idx_orders_geo_locale_currency ON public.orders(country_id, lang_id, currency_id);

-- 3) Product model deep entities
CREATE TABLE IF NOT EXISTS public.product_plans (
  plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  duration TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, name)
);

CREATE TABLE IF NOT EXISTS public.product_versions (
  version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  changelog TEXT,
  apk_id UUID REFERENCES public.apk_builds(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, version)
);

CREATE TABLE IF NOT EXISTS public.product_access_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  condition TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, role, condition)
);

-- 4) Payment core additions
CREATE TABLE IF NOT EXISTS public.payment_intents (
  intent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'requires_action', 'succeeded', 'failed', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_webhooks (
  webhook_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refunds (
  refund_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Double-entry-compatible ledger
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  debit NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_one_side CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_created ON public.ledger_entries(wallet_id, created_at DESC);

-- 6) Reseller control additions
CREATE TABLE IF NOT EXISTS public.reseller_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  percent NUMERIC(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reseller_id, product_id)
);

-- 7) API gateway tracking additions
CREATE TABLE IF NOT EXISTS public.api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  cost NUMERIC(12,6) NOT NULL DEFAULT 0,
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_usage_key_created ON public.api_usage(key_id, created_at DESC);

-- 8) AI orchestration additions
CREATE TABLE IF NOT EXISTS public.ai_pipeline (
  step_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence INTEGER NOT NULL,
  role TEXT NOT NULL,
  model_id UUID REFERENCES public.ai_models(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sequence, role)
);

-- 9) Build artifacts/logs additions
CREATE TABLE IF NOT EXISTS public.build_logs (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.build_queue(id) ON DELETE CASCADE,
  step TEXT,
  output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.build_artifacts (
  artifact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.build_queue(id) ON DELETE CASCADE,
  apk_url TEXT,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10) Server manager additions
CREATE TABLE IF NOT EXISTS public.server_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE,
  cpu NUMERIC(6,2),
  ram NUMERIC(6,2),
  disk NUMERIC(6,2),
  latency NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.server_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('restart', 'deploy', 'rollback')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed')),
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ssl_certs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL UNIQUE,
  expiry TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11) Event driven + queues
CREATE TABLE IF NOT EXISTS public.events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name TEXT NOT NULL,
  job_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'failed', 'dead_letter')),
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_queues_name_status_created ON public.queues(queue_name, status, created_at);

-- 12) Security logs
CREATE TABLE IF NOT EXISTS public.security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  ip_address TEXT,
  device_fingerprint TEXT,
  anomaly_score NUMERIC(8,4),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_logs_user_created ON public.security_logs(user_id, created_at DESC);

-- 13) Observability consolidation view
CREATE OR REPLACE VIEW public.observability_unified AS
SELECT
  'audit'::TEXT AS source,
  COALESCE(a.created_at, now()) AS ts,
  COALESCE(a.user_id, a.actor_id) AS user_id,
  COALESCE(a.module, a.table_name, 'audit') AS module,
  COALESCE(a.action, 'read') AS action,
  NULL::TEXT AS trace_id,
  a.status AS status,
  COALESCE(a.message, a.event_type, 'audit_event') AS summary,
  COALESCE(a.new_data, a.metadata, '{}'::jsonb) AS payload
FROM public.audit_logs a
UNION ALL
SELECT
  'trace'::TEXT AS source,
  t.created_at AS ts,
  t.user_id,
  t.module,
  t.action,
  t.trace_id,
  CASE WHEN t.response_status BETWEEN 200 AND 399 THEN 'success' ELSE 'error' END AS status,
  COALESCE(t.api_endpoint, 'trace') AS summary,
  t.request_payload AS payload
FROM public.trace_logs t
UNION ALL
SELECT
  'health'::TEXT AS source,
  COALESCE(h.last_checked, now()) AS ts,
  NULL::UUID AS user_id,
  'system_health'::TEXT AS module,
  COALESCE(h.status, 'check') AS action,
  NULL::TEXT AS trace_id,
  COALESCE(h.status, 'unknown') AS status,
  COALESCE(h.module_name, 'health') AS summary,
  jsonb_build_object('response_time', h.response_time, 'module_name', h.module_name) AS payload
FROM public.system_health h;

-- 14) Generic update triggers (idempotent)
DO $$
BEGIN
  IF to_regproc('public.update_updated_at_column') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_currencies_updated_at') THEN
      CREATE TRIGGER trg_currencies_updated_at BEFORE UPDATE ON public.currencies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_countries_updated_at') THEN
      CREATE TRIGGER trg_countries_updated_at BEFORE UPDATE ON public.countries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_product_plans_updated_at') THEN
      CREATE TRIGGER trg_product_plans_updated_at BEFORE UPDATE ON public.product_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payment_intents_updated_at') THEN
      CREATE TRIGGER trg_payment_intents_updated_at BEFORE UPDATE ON public.payment_intents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payment_webhooks_updated_at') THEN
      CREATE TRIGGER trg_payment_webhooks_updated_at BEFORE UPDATE ON public.payment_webhooks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_refunds_updated_at') THEN
      CREATE TRIGGER trg_refunds_updated_at BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_reseller_commissions_updated_at') THEN
      CREATE TRIGGER trg_reseller_commissions_updated_at BEFORE UPDATE ON public.reseller_commissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ai_pipeline_updated_at') THEN
      CREATE TRIGGER trg_ai_pipeline_updated_at BEFORE UPDATE ON public.ai_pipeline FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_server_actions_updated_at') THEN
      CREATE TRIGGER trg_server_actions_updated_at BEFORE UPDATE ON public.server_actions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ssl_certs_updated_at') THEN
      CREATE TRIGGER trg_ssl_certs_updated_at BEFORE UPDATE ON public.ssl_certs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_events_updated_at') THEN
      CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_queues_updated_at') THEN
      CREATE TRIGGER trg_queues_updated_at BEFORE UPDATE ON public.queues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
END $$;

-- 15) RLS + baseline policies
ALTER TABLE public.trace_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_access_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ssl_certs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  IF to_regproc('public.has_role') IS NULL THEN
    RAISE NOTICE 'public.has_role not found; skipping role-based policies for ultra god mode v2 tables';
    RETURN;
  END IF;

  FOREACH tbl IN ARRAY ARRAY[
    'trace_logs','currencies','countries','product_plans','product_versions','product_access_rules',
    'payment_intents','payment_webhooks','refunds','ledger_entries','reseller_commissions','api_usage',
    'ai_pipeline','build_logs','build_artifacts','server_metrics','server_actions','ssl_certs',
    'events','queues','security_logs'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=tbl AND policyname='Authenticated read ' || tbl
    ) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() IS NOT NULL)', 'Authenticated read ' || tbl, tbl);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=tbl AND policyname='Super admin manage ' || tbl
    ) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.has_role(auth.uid(), ''super_admin'')) WITH CHECK (public.has_role(auth.uid(), ''super_admin''))', 'Super admin manage ' || tbl, tbl);
    END IF;
  END LOOP;
END $$;

-- 16) Seed baseline locale/currency/country values
INSERT INTO public.currencies (code, symbol, rate)
VALUES
  ('USD', '$', 1),
  ('INR', '₹', 83),
  ('EUR', '€', 0.92),
  ('AED', 'د.إ', 3.67)
ON CONFLICT (code) DO UPDATE
SET symbol = EXCLUDED.symbol,
    rate = EXCLUDED.rate,
    updated_at = now();

INSERT INTO public.countries (name, currency_id, lang_id)
SELECT 'India', c.currency_id, 'hi' FROM public.currencies c WHERE c.code = 'INR'
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.countries (name, currency_id, lang_id)
SELECT 'United States', c.currency_id, 'en' FROM public.currencies c WHERE c.code = 'USD'
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.countries (name, currency_id, lang_id)
SELECT 'United Arab Emirates', c.currency_id, 'ar' FROM public.currencies c WHERE c.code = 'AED'
ON CONFLICT (name) DO NOTHING;

-- 17) Seed default AI pipeline
INSERT INTO public.ai_pipeline (sequence, role, model_id, is_active)
VALUES
  (1, 'generate', NULL, true),
  (2, 'validate', NULL, true),
  (3, 'debug', NULL, true),
  (4, 'optimize', NULL, true)
ON CONFLICT (sequence, role) DO UPDATE
SET is_active = EXCLUDED.is_active,
    updated_at = now();
