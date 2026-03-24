-- =============================================
-- CORE DATABASE SCHEMA FOR SAAS VALA ADMIN SYSTEM
-- =============================================

-- Categories (4-level hierarchy: Master > Sub > Micro > Nano)
CREATE TYPE public.category_level AS ENUM ('master', 'sub', 'micro', 'nano');

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  level category_level NOT NULL,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  description TEXT,
  icon TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Products
CREATE TYPE public.product_status AS ENUM ('active', 'suspended', 'archived', 'draft');

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  status product_status DEFAULT 'draft',
  price DECIMAL(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  version TEXT DEFAULT '1.0.0',
  features JSONB DEFAULT '[]',
  meta JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Demos (linked to products)
CREATE TYPE public.demo_status AS ENUM ('active', 'expired', 'disabled');

CREATE TABLE public.demos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  credentials JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  status demo_status DEFAULT 'active',
  access_count INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- APKs (linked to products)
CREATE TYPE public.apk_status AS ENUM ('published', 'draft', 'deprecated');

CREATE TABLE public.apks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  version TEXT NOT NULL,
  file_url TEXT,
  file_size BIGINT,
  changelog TEXT,
  min_sdk INT,
  target_sdk INT,
  status apk_status DEFAULT 'draft',
  download_count INT DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- License Keys
CREATE TYPE public.key_status AS ENUM ('active', 'expired', 'suspended', 'revoked');
CREATE TYPE public.key_type AS ENUM ('lifetime', 'yearly', 'monthly', 'trial');

CREATE TABLE public.license_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  license_key TEXT NOT NULL UNIQUE,
  key_type key_type NOT NULL DEFAULT 'yearly',
  status key_status DEFAULT 'active',
  owner_email TEXT,
  owner_name TEXT,
  device_id TEXT,
  max_devices INT DEFAULT 1,
  activated_devices INT DEFAULT 0,
  expires_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  notes TEXT,
  meta JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Wallets (one per user)
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  balance DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Transactions
CREATE TYPE public.transaction_type AS ENUM ('credit', 'debit', 'refund', 'adjustment');
CREATE TYPE public.transaction_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE CASCADE NOT NULL,
  type transaction_type NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  balance_after DECIMAL(12,2),
  status transaction_status DEFAULT 'pending',
  description TEXT,
  reference_id TEXT,
  reference_type TEXT,
  meta JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Servers (Vercel-style deployments)
CREATE TYPE public.server_status AS ENUM ('deploying', 'live', 'failed', 'stopped', 'suspended');
CREATE TYPE public.server_runtime AS ENUM ('nodejs18', 'nodejs20', 'php82', 'php83', 'python311', 'python312');

CREATE TABLE public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  custom_domain TEXT,
  git_repo TEXT,
  git_branch TEXT DEFAULT 'main',
  runtime server_runtime DEFAULT 'nodejs18',
  status server_status DEFAULT 'stopped',
  auto_deploy BOOLEAN DEFAULT true,
  ssl_status TEXT DEFAULT 'pending',
  env_vars JSONB DEFAULT '{}',
  last_deploy_at TIMESTAMPTZ,
  last_deploy_commit TEXT,
  last_deploy_message TEXT,
  health_status TEXT DEFAULT 'unknown',
  uptime_percent DECIMAL(5,2) DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Deployments (history for each server)
CREATE TYPE public.deploy_status AS ENUM ('queued', 'building', 'success', 'failed', 'cancelled', 'rolled_back');

CREATE TABLE public.deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES public.servers(id) ON DELETE CASCADE NOT NULL,
  commit_sha TEXT,
  commit_message TEXT,
  branch TEXT,
  status deploy_status DEFAULT 'queued',
  build_logs TEXT,
  duration_seconds INT,
  deployed_url TEXT,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- SEO Data
CREATE TABLE public.seo_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  meta_description TEXT,
  keywords TEXT[],
  og_image TEXT,
  canonical_url TEXT,
  robots TEXT DEFAULT 'index, follow',
  structured_data JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Leads
CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'qualified', 'converted', 'lost');
CREATE TYPE public.lead_source AS ENUM ('website', 'referral', 'social', 'ads', 'organic', 'other');

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  source lead_source DEFAULT 'website',
  status lead_status DEFAULT 'new',
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  notes TEXT,
  tags TEXT[],
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- AI Usage Tracking
CREATE TABLE public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  model TEXT NOT NULL,
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0,
  session_id TEXT,
  endpoint TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit Logs (track every action)
CREATE TYPE public.audit_action AS ENUM ('create', 'read', 'update', 'delete', 'login', 'logout', 'suspend', 'activate');

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action audit_action NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Resellers (extended from user_roles)
CREATE TABLE public.resellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  company_name TEXT,
  commission_percent DECIMAL(5,2) DEFAULT 10,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  total_sales DECIMAL(12,2) DEFAULT 0,
  total_commission DECIMAL(12,2) DEFAULT 0,
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Super Admin can do everything
CREATE POLICY "Super admin full access categories" ON public.categories FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access products" ON public.products FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access demos" ON public.demos FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access apks" ON public.apks FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access license_keys" ON public.license_keys FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access wallets" ON public.wallets FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access transactions" ON public.transactions FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access servers" ON public.servers FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access deployments" ON public.deployments FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access seo_data" ON public.seo_data FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access leads" ON public.leads FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access ai_usage" ON public.ai_usage FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access audit_logs" ON public.audit_logs FOR ALL USING (has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin full access resellers" ON public.resellers FOR ALL USING (has_role(auth.uid(), 'super_admin'));

-- RLS Policies: Resellers can view products/categories, manage their own keys/servers
CREATE POLICY "Resellers view categories" ON public.categories FOR SELECT USING (has_role(auth.uid(), 'reseller'));
CREATE POLICY "Resellers view active products" ON public.products FOR SELECT USING (has_role(auth.uid(), 'reseller') AND status = 'active');
CREATE POLICY "Resellers view demos" ON public.demos FOR SELECT USING (has_role(auth.uid(), 'reseller'));
CREATE POLICY "Resellers view apks" ON public.apks FOR SELECT USING (has_role(auth.uid(), 'reseller') AND status = 'published');

-- Resellers manage their own license keys
CREATE POLICY "Resellers view own keys" ON public.license_keys FOR SELECT USING (has_role(auth.uid(), 'reseller') AND created_by = auth.uid());
CREATE POLICY "Resellers create keys" ON public.license_keys FOR INSERT WITH CHECK (has_role(auth.uid(), 'reseller') AND created_by = auth.uid());
CREATE POLICY "Resellers update own keys" ON public.license_keys FOR UPDATE USING (has_role(auth.uid(), 'reseller') AND created_by = auth.uid());

-- Resellers manage their own wallet
CREATE POLICY "Users view own wallet" ON public.wallets FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users view own transactions" ON public.transactions FOR SELECT USING (wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid()));

-- Resellers manage their own servers
CREATE POLICY "Resellers view own servers" ON public.servers FOR SELECT USING (has_role(auth.uid(), 'reseller') AND created_by = auth.uid());
CREATE POLICY "Resellers create servers" ON public.servers FOR INSERT WITH CHECK (has_role(auth.uid(), 'reseller') AND created_by = auth.uid());
CREATE POLICY "Resellers update own servers" ON public.servers FOR UPDATE USING (has_role(auth.uid(), 'reseller') AND created_by = auth.uid());
CREATE POLICY "Resellers view own deployments" ON public.deployments FOR SELECT USING (server_id IN (SELECT id FROM public.servers WHERE created_by = auth.uid()));

-- Resellers view own leads
CREATE POLICY "Resellers view assigned leads" ON public.leads FOR SELECT USING (has_role(auth.uid(), 'reseller') AND assigned_to = auth.uid());

-- AI usage tracking for all authenticated users
CREATE POLICY "Users view own ai usage" ON public.ai_usage FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users create own ai usage" ON public.ai_usage FOR INSERT WITH CHECK (user_id = auth.uid());

-- Create updated_at triggers
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_demos_updated_at BEFORE UPDATE ON public.demos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_apks_updated_at BEFORE UPDATE ON public.apks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_license_keys_updated_at BEFORE UPDATE ON public.license_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON public.servers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_seo_data_updated_at BEFORE UPDATE ON public.seo_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_resellers_updated_at BEFORE UPDATE ON public.resellers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create wallet for new users automatically
CREATE OR REPLACE FUNCTION public.create_wallet_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER create_wallet_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.create_wallet_for_new_user();

-- Function to generate unique license key
CREATE OR REPLACE FUNCTION public.generate_license_key()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INT;
  j INT;
BEGIN
  FOR j IN 1..4 LOOP
    IF j > 1 THEN
      result := result || '-';
    END IF;
    FOR i IN 1..4 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;