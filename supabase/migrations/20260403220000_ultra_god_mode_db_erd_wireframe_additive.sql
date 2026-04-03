-- ULTRA GOD MODE (additive only)
-- No destructive changes. Defines and strengthens DB + ERD + Wireframe mappings.

-- 1) Module registry (conceptual system modules)
CREATE TABLE IF NOT EXISTS public.system_module_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key TEXT NOT NULL UNIQUE,
  module_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'core',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Entity/table registry (conceptual -> physical link)
CREATE TABLE IF NOT EXISTS public.system_entity_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_key TEXT NOT NULL UNIQUE,
  module_key TEXT NOT NULL REFERENCES public.system_module_registry(module_key) ON DELETE CASCADE,
  conceptual_table_name TEXT NOT NULL,
  physical_table_name TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Field-level architecture definition
CREATE TABLE IF NOT EXISTS public.system_entity_field_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_key TEXT NOT NULL REFERENCES public.system_entity_registry(entity_key) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_type TEXT,
  is_primary_key BOOLEAN NOT NULL DEFAULT false,
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_reference BOOLEAN NOT NULL DEFAULT false,
  reference_entity_key TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_key, field_name)
);

-- 4) API endpoint registry
CREATE TABLE IF NOT EXISTS public.system_api_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key TEXT NOT NULL UNIQUE,
  module_key TEXT NOT NULL REFERENCES public.system_module_registry(module_key) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  http_method TEXT NOT NULL DEFAULT 'POST',
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Role access mapping
CREATE TABLE IF NOT EXISTS public.system_role_access_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name TEXT NOT NULL CHECK (role_name IN ('admin', 'reseller', 'user')),
  module_key TEXT NOT NULL REFERENCES public.system_module_registry(module_key) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_name, module_key, permission_key)
);

-- 6) Critical button -> API -> DB -> role flow mapping
CREATE TABLE IF NOT EXISTS public.system_button_flow_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_key TEXT NOT NULL UNIQUE,
  button_name TEXT NOT NULL,
  api_key TEXT REFERENCES public.system_api_registry(api_key) ON DELETE SET NULL,
  db_write_entities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  process_sequence JSONB NOT NULL DEFAULT '[]'::jsonb,
  response_target TEXT NOT NULL DEFAULT 'ui',
  allowed_roles TEXT[] NOT NULL DEFAULT ARRAY['user']::TEXT[],
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7) ERD relation registry
CREATE TABLE IF NOT EXISTS public.system_erd_relation_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relation_key TEXT NOT NULL UNIQUE,
  from_entity_key TEXT NOT NULL REFERENCES public.system_entity_registry(entity_key) ON DELETE CASCADE,
  to_entity_key TEXT NOT NULL REFERENCES public.system_entity_registry(entity_key) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'many_to_one',
  relation_path TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8) Wireframe flow stage registry
CREATE TABLE IF NOT EXISTS public.system_wireframe_flow_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_key TEXT NOT NULL,
  stage_order INTEGER NOT NULL CHECK (stage_order > 0),
  stage_name TEXT NOT NULL,
  stage_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(flow_key, stage_order)
);

CREATE INDEX IF NOT EXISTS idx_system_entity_registry_module_key
  ON public.system_entity_registry(module_key);
CREATE INDEX IF NOT EXISTS idx_system_entity_field_registry_entity_key
  ON public.system_entity_field_registry(entity_key);
CREATE INDEX IF NOT EXISTS idx_system_api_registry_module_key
  ON public.system_api_registry(module_key);
CREATE INDEX IF NOT EXISTS idx_system_button_flow_registry_status
  ON public.system_button_flow_registry(status);
CREATE INDEX IF NOT EXISTS idx_system_role_access_registry_role
  ON public.system_role_access_registry(role_name);

-- updated_at triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_system_module_registry_updated_at') THEN
    CREATE TRIGGER update_system_module_registry_updated_at
    BEFORE UPDATE ON public.system_module_registry
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_system_entity_registry_updated_at') THEN
    CREATE TRIGGER update_system_entity_registry_updated_at
    BEFORE UPDATE ON public.system_entity_registry
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_system_api_registry_updated_at') THEN
    CREATE TRIGGER update_system_api_registry_updated_at
    BEFORE UPDATE ON public.system_api_registry
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_system_button_flow_registry_updated_at') THEN
    CREATE TRIGGER update_system_button_flow_registry_updated_at
    BEFORE UPDATE ON public.system_button_flow_registry
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- RLS and policies (read for authenticated, write for super_admin)
ALTER TABLE public.system_module_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_entity_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_entity_field_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_api_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_role_access_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_button_flow_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_erd_relation_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_wireframe_flow_registry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_module_registry' AND policyname='Authenticated read system_module_registry') THEN
    CREATE POLICY "Authenticated read system_module_registry" ON public.system_module_registry
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_module_registry' AND policyname='Super admin manage system_module_registry') THEN
    CREATE POLICY "Super admin manage system_module_registry" ON public.system_module_registry
      FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_entity_registry' AND policyname='Authenticated read system_entity_registry') THEN
    CREATE POLICY "Authenticated read system_entity_registry" ON public.system_entity_registry
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_entity_registry' AND policyname='Super admin manage system_entity_registry') THEN
    CREATE POLICY "Super admin manage system_entity_registry" ON public.system_entity_registry
      FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_entity_field_registry' AND policyname='Authenticated read system_entity_field_registry') THEN
    CREATE POLICY "Authenticated read system_entity_field_registry" ON public.system_entity_field_registry
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_entity_field_registry' AND policyname='Super admin manage system_entity_field_registry') THEN
    CREATE POLICY "Super admin manage system_entity_field_registry" ON public.system_entity_field_registry
      FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_api_registry' AND policyname='Authenticated read system_api_registry') THEN
    CREATE POLICY "Authenticated read system_api_registry" ON public.system_api_registry
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_api_registry' AND policyname='Super admin manage system_api_registry') THEN
    CREATE POLICY "Super admin manage system_api_registry" ON public.system_api_registry
      FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_role_access_registry' AND policyname='Authenticated read system_role_access_registry') THEN
    CREATE POLICY "Authenticated read system_role_access_registry" ON public.system_role_access_registry
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_role_access_registry' AND policyname='Super admin manage system_role_access_registry') THEN
    CREATE POLICY "Super admin manage system_role_access_registry" ON public.system_role_access_registry
      FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_button_flow_registry' AND policyname='Authenticated read system_button_flow_registry') THEN
    CREATE POLICY "Authenticated read system_button_flow_registry" ON public.system_button_flow_registry
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_button_flow_registry' AND policyname='Super admin manage system_button_flow_registry') THEN
    CREATE POLICY "Super admin manage system_button_flow_registry" ON public.system_button_flow_registry
      FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_erd_relation_registry' AND policyname='Authenticated read system_erd_relation_registry') THEN
    CREATE POLICY "Authenticated read system_erd_relation_registry" ON public.system_erd_relation_registry
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_erd_relation_registry' AND policyname='Super admin manage system_erd_relation_registry') THEN
    CREATE POLICY "Super admin manage system_erd_relation_registry" ON public.system_erd_relation_registry
      FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_wireframe_flow_registry' AND policyname='Authenticated read system_wireframe_flow_registry') THEN
    CREATE POLICY "Authenticated read system_wireframe_flow_registry" ON public.system_wireframe_flow_registry
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_wireframe_flow_registry' AND policyname='Super admin manage system_wireframe_flow_registry') THEN
    CREATE POLICY "Super admin manage system_wireframe_flow_registry" ON public.system_wireframe_flow_registry
      FOR ALL USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

-- Seed module definitions
INSERT INTO public.system_module_registry (module_key, module_name, category)
VALUES
  ('identity', 'Identity & Access', 'core'),
  ('marketplace', 'Marketplace Product System', 'core'),
  ('category', 'Category System', 'core'),
  ('commerce', 'Order & Payment System', 'core'),
  ('wallet', 'Wallet System', 'finance'),
  ('subscription', 'Subscription System', 'core'),
  ('keys', 'Key Management', 'core'),
  ('reseller', 'Reseller System', 'core'),
  ('ai', 'AI System', 'intelligence'),
  ('server', 'Server Manager', 'ops'),
  ('apk_pipeline', 'APK Pipeline', 'ops'),
  ('audit', 'Audit Logs', 'ops'),
  ('health', 'System Health', 'ops'),
  ('seo_leads', 'SEO + Leads', 'growth'),
  ('notifications', 'Notifications', 'engagement')
ON CONFLICT (module_key) DO UPDATE
SET module_name = EXCLUDED.module_name,
    category = EXCLUDED.category,
    updated_at = now();

-- Seed entity definitions from the requested architecture
INSERT INTO public.system_entity_registry (entity_key, module_key, conceptual_table_name, physical_table_name, description)
VALUES
  ('users', 'identity', 'USERS', 'users', 'User profiles and core identity'),
  ('roles', 'identity', 'ROLES', 'roles', 'Role and permission definitions'),
  ('sessions', 'identity', 'SESSIONS', 'user_sessions', 'Active user session tracking'),
  ('products', 'marketplace', 'PRODUCTS', 'products', 'Marketplace catalog'),
  ('product_media', 'marketplace', 'PRODUCT_MEDIA', 'product_media', 'Product images/videos'),
  ('product_features', 'marketplace', 'PRODUCT_FEATURES', 'product_features', 'Product feature metadata'),
  ('categories', 'category', 'CATEGORIES', 'categories', 'Macro/sub/micro category tree'),
  ('orders', 'commerce', 'ORDERS', 'orders', 'Order lifecycle'),
  ('payments', 'commerce', 'PAYMENTS', 'payments', 'Payment lifecycle'),
  ('wallets', 'wallet', 'WALLETS', 'wallets', 'Wallet balances'),
  ('transactions', 'wallet', 'TRANSACTIONS', 'transactions', 'Wallet transaction journal'),
  ('subscriptions', 'subscription', 'SUBSCRIPTIONS', 'subscriptions', 'Subscription lifecycle'),
  ('license_keys', 'keys', 'LICENSE_KEYS', 'license_keys', 'License key lifecycle'),
  ('resellers', 'reseller', 'RESELLERS', 'resellers', 'Reseller account states'),
  ('reseller_keys', 'reseller', 'RESELLER_KEYS', 'reseller_keys', 'Reseller key usage tracking'),
  ('ai_requests', 'ai', 'AI_REQUESTS', 'ai_requests', 'AI request tracking'),
  ('servers', 'server', 'SERVERS', 'servers', 'Server inventory'),
  ('deployments', 'server', 'DEPLOYMENTS', 'deployments', 'Deployment tracking'),
  ('apk_builds', 'apk_pipeline', 'APK_BUILDS', 'apk_builds', 'APK build pipeline'),
  ('audit_logs', 'audit', 'AUDIT_LOGS', 'audit_logs', 'Audit record stream'),
  ('system_health', 'health', 'SYSTEM_HEALTH', 'system_health', 'Health check telemetry'),
  ('leads', 'seo_leads', 'LEADS', 'leads', 'Lead pipeline'),
  ('seo_data', 'seo_leads', 'SEO_DATA', 'seo_data', 'SEO ranking metadata'),
  ('notifications', 'notifications', 'NOTIFICATIONS', 'notifications', 'Notification queue/history')
ON CONFLICT (entity_key) DO UPDATE
SET module_key = EXCLUDED.module_key,
    conceptual_table_name = EXCLUDED.conceptual_table_name,
    physical_table_name = EXCLUDED.physical_table_name,
    description = EXCLUDED.description,
    updated_at = now();

-- Seed key fields for each conceptual table
INSERT INTO public.system_entity_field_registry (entity_key, field_name, field_type, is_primary_key, is_required, is_reference, reference_entity_key, notes)
VALUES
  ('users', 'user_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('users', 'email', 'text', false, true, false, NULL, 'Unique email'),
  ('users', 'role', 'text', false, true, true, 'roles', 'admin/reseller/user'),
  ('roles', 'role_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('roles', 'permissions', 'jsonb', false, false, false, NULL, 'Permission matrix'),
  ('sessions', 'session_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('sessions', 'user_id', 'uuid', false, true, true, 'users', 'Session owner'),
  ('products', 'product_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('products', 'created_by', 'uuid', false, false, true, 'users', 'Creator user'),
  ('product_media', 'media_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('product_media', 'product_id', 'uuid', false, true, true, 'products', 'Media parent'),
  ('product_features', 'feature_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('product_features', 'product_id', 'uuid', false, true, true, 'products', 'Feature parent'),
  ('categories', 'category_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('categories', 'parent_id', 'uuid', false, false, true, 'categories', 'Hierarchy parent'),
  ('orders', 'order_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('orders', 'user_id', 'uuid', false, true, true, 'users', 'Buyer'),
  ('orders', 'product_id', 'uuid', false, true, true, 'products', 'Purchased product'),
  ('payments', 'payment_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('payments', 'order_id', 'uuid', false, true, true, 'orders', 'Payment target order'),
  ('wallets', 'wallet_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('wallets', 'user_id', 'uuid', false, true, true, 'users', 'Wallet owner'),
  ('transactions', 'txn_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('transactions', 'wallet_id', 'uuid', false, true, true, 'wallets', 'Wallet entry'),
  ('subscriptions', 'sub_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('subscriptions', 'user_id', 'uuid', false, true, true, 'users', 'Subscriber'),
  ('subscriptions', 'product_id', 'uuid', false, true, true, 'products', 'Subscribed product'),
  ('license_keys', 'key_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('license_keys', 'product_id', 'uuid', false, true, true, 'products', 'Licensed product'),
  ('license_keys', 'user_id_reseller_id', 'uuid', false, false, true, 'users', 'Consumer or reseller owner'),
  ('resellers', 'reseller_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('resellers', 'user_id', 'uuid', false, true, true, 'users', 'User mapping'),
  ('reseller_keys', 'id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('reseller_keys', 'reseller_id', 'uuid', false, true, true, 'resellers', 'Reseller owner'),
  ('reseller_keys', 'key_id', 'uuid', false, true, true, 'license_keys', 'Assigned key'),
  ('ai_requests', 'request_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('ai_requests', 'user_id', 'uuid', false, true, true, 'users', 'Requester'),
  ('servers', 'server_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('deployments', 'deploy_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('deployments', 'server_id', 'uuid', false, true, true, 'servers', 'Deployment target'),
  ('deployments', 'product_id', 'uuid', false, true, true, 'products', 'Deployment product'),
  ('apk_builds', 'build_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('apk_builds', 'product_id', 'uuid', false, true, true, 'products', 'Build product'),
  ('audit_logs', 'log_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('audit_logs', 'user_id', 'uuid', false, false, true, 'users', 'Actor'),
  ('system_health', 'id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('leads', 'lead_id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('seo_data', 'id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('seo_data', 'product_id', 'uuid', false, true, true, 'products', 'SEO target product'),
  ('notifications', 'id', 'uuid', true, true, false, NULL, 'Primary key'),
  ('notifications', 'user_id', 'uuid', false, true, true, 'users', 'Notification target')
ON CONFLICT (entity_key, field_name) DO UPDATE
SET field_type = EXCLUDED.field_type,
    is_primary_key = EXCLUDED.is_primary_key,
    is_required = EXCLUDED.is_required,
    is_reference = EXCLUDED.is_reference,
    reference_entity_key = EXCLUDED.reference_entity_key,
    notes = EXCLUDED.notes;

-- Seed API endpoint definitions (button-connected)
INSERT INTO public.system_api_registry (api_key, module_key, endpoint, http_method, purpose)
VALUES
  ('buy_now', 'commerce', '/api/v1/marketplace/payment/init', 'POST', 'Create order and initialize payment for BUY NOW'),
  ('add_money', 'wallet', '/api/v1/wallet/add', 'POST', 'Fund wallet from ADD MONEY action'),
  ('generate_key', 'keys', '/api/v1/keys/generate', 'POST', 'Generate key after wallet validation'),
  ('apk_download', 'marketplace', '/api/v1/apk/download', 'POST', 'Validate purchase and return APK URL'),
  ('ai_run', 'ai', '/api/v1/ai/run', 'POST', 'Run AI request and return result')
ON CONFLICT (api_key) DO UPDATE
SET module_key = EXCLUDED.module_key,
    endpoint = EXCLUDED.endpoint,
    http_method = EXCLUDED.http_method,
    purpose = EXCLUDED.purpose,
    updated_at = now();

-- Seed role-based access (admin/reseller/user)
INSERT INTO public.system_role_access_registry (role_name, module_key, permission_key, allowed, notes)
VALUES
  ('admin', 'commerce', 'buy_now', true, 'Full control'),
  ('admin', 'wallet', 'add_money', true, 'Full control'),
  ('admin', 'keys', 'generate_key', true, 'Full control'),
  ('admin', 'marketplace', 'apk_download', true, 'Full control'),
  ('admin', 'ai', 'ai_run', true, 'Full control'),
  ('reseller', 'commerce', 'buy_now', true, 'Can buy'),
  ('reseller', 'wallet', 'add_money', true, 'Can use wallet'),
  ('reseller', 'keys', 'generate_key', true, 'Can generate keys'),
  ('reseller', 'marketplace', 'apk_download', true, 'Can download purchased APK'),
  ('reseller', 'ai', 'ai_run', true, 'Can run AI module'),
  ('user', 'commerce', 'buy_now', true, 'Can buy'),
  ('user', 'wallet', 'add_money', true, 'Can add wallet funds'),
  ('user', 'keys', 'generate_key', false, 'No direct key generation'),
  ('user', 'marketplace', 'apk_download', true, 'Can download after purchase'),
  ('user', 'ai', 'ai_run', true, 'Can run AI if available')
ON CONFLICT (role_name, module_key, permission_key) DO UPDATE
SET allowed = EXCLUDED.allowed,
    notes = EXCLUDED.notes;

-- Seed critical button flows
INSERT INTO public.system_button_flow_registry (flow_key, button_name, api_key, db_write_entities, process_sequence, response_target, allowed_roles)
VALUES
  (
    'buy_now_flow',
    'BUY NOW',
    'buy_now',
    ARRAY['orders', 'payments', 'subscriptions', 'license_keys'],
    '["button_click","create_order","process_payment","activate_subscription","create_license_key","grant_access","ui_update"]'::jsonb,
    'ui_purchase_state',
    ARRAY['admin','reseller','user']
  ),
  (
    'add_money_flow',
    'ADD MONEY',
    'add_money',
    ARRAY['payments', 'transactions', 'wallets'],
    '["button_click","create_payment","record_transaction","update_wallet_balance","ui_update"]'::jsonb,
    'ui_wallet_state',
    ARRAY['admin','reseller','user']
  ),
  (
    'generate_key_flow',
    'GENERATE KEY',
    'generate_key',
    ARRAY['wallets', 'transactions', 'license_keys', 'reseller_keys'],
    '["button_click","check_wallet_balance","deduct_wallet","create_license_key","map_reseller_key","ui_update"]'::jsonb,
    'ui_key_state',
    ARRAY['admin','reseller']
  ),
  (
    'apk_download_flow',
    'APK DOWNLOAD',
    'apk_download',
    ARRAY['orders', 'subscriptions', 'products'],
    '["button_click","verify_purchase","resolve_apk_url","return_secure_download","ui_update"]'::jsonb,
    'ui_download_state',
    ARRAY['admin','reseller','user']
  ),
  (
    'ai_run_flow',
    'AI RUN',
    'ai_run',
    ARRAY['ai_requests'],
    '["button_click","create_ai_request","process_ai_module","store_ai_output","return_result","ui_update"]'::jsonb,
    'ui_ai_state',
    ARRAY['admin','reseller','user']
  )
ON CONFLICT (flow_key) DO UPDATE
SET button_name = EXCLUDED.button_name,
    api_key = EXCLUDED.api_key,
    db_write_entities = EXCLUDED.db_write_entities,
    process_sequence = EXCLUDED.process_sequence,
    response_target = EXCLUDED.response_target,
    allowed_roles = EXCLUDED.allowed_roles,
    updated_at = now();

-- Seed ERD relation registry (simplified from requested model)
INSERT INTO public.system_erd_relation_registry (relation_key, from_entity_key, to_entity_key, relation_type, relation_path, notes)
VALUES
  ('users_orders', 'users', 'orders', 'one_to_many', 'USERS -> ORDERS', 'User places many orders'),
  ('orders_payments', 'orders', 'payments', 'one_to_many', 'ORDERS -> PAYMENTS', 'Order has payment attempts'),
  ('users_wallets', 'users', 'wallets', 'one_to_one', 'USERS -> WALLETS', 'User wallet'),
  ('wallets_transactions', 'wallets', 'transactions', 'one_to_many', 'WALLETS -> TRANSACTIONS', 'Wallet ledger entries'),
  ('users_subscriptions', 'users', 'subscriptions', 'one_to_many', 'USERS -> SUBSCRIPTIONS', 'User subscriptions'),
  ('subscriptions_products', 'subscriptions', 'products', 'many_to_one', 'SUBSCRIPTIONS -> PRODUCTS', 'Subscription target product'),
  ('products_apk_builds', 'products', 'apk_builds', 'one_to_many', 'PRODUCTS -> APK_BUILDS', 'APK versions per product'),
  ('resellers_license_keys', 'resellers', 'license_keys', 'one_to_many', 'RESELLERS -> LICENSE_KEYS', 'Reseller-owned keys'),
  ('servers_deployments', 'servers', 'deployments', 'one_to_many', 'SERVERS -> DEPLOYMENTS', 'Deployment records')
ON CONFLICT (relation_key) DO UPDATE
SET from_entity_key = EXCLUDED.from_entity_key,
    to_entity_key = EXCLUDED.to_entity_key,
    relation_type = EXCLUDED.relation_type,
    relation_path = EXCLUDED.relation_path,
    notes = EXCLUDED.notes;

-- Seed wireframe pipeline flow
INSERT INTO public.system_wireframe_flow_registry (flow_key, stage_order, stage_name, stage_description)
VALUES
  ('global_ui_system_flow', 1, 'UI BUTTON', 'User action triggered from UI'),
  ('global_ui_system_flow', 2, 'API', 'Request routed through API endpoint'),
  ('global_ui_system_flow', 3, 'DB WRITE', 'Initial data persistence'),
  ('global_ui_system_flow', 4, 'PROCESS', 'Business logic execution'),
  ('global_ui_system_flow', 5, 'DB UPDATE', 'State transition persistence'),
  ('global_ui_system_flow', 6, 'RESPONSE', 'API response returned'),
  ('global_ui_system_flow', 7, 'UI UPDATE', 'UI state reconciled')
ON CONFLICT (flow_key, stage_order) DO UPDATE
SET stage_name = EXCLUDED.stage_name,
    stage_description = EXCLUDED.stage_description;
