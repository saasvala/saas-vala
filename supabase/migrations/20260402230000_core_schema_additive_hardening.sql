-- Core schema additive hardening for route/service/api/db consistency.
-- Non-destructive only: create missing tables/columns, indexes, and FK constraints.

-- 1) Roles table (kept in sync with existing app_role enum via trigger-friendly mapping layer)
CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Users projection table (does not replace auth.users; additive app-facing projection)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  email TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_role_id ON public.users (role_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users (status);

-- 3) Products hardening fields/indexes
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS status TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_status_valid'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_status_valid
      CHECK (status IS NULL OR status IN ('draft', 'active', 'inactive', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_category_status
  ON public.products (category_id, status);

-- 4) Orders hardening aliases/indexes
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS total DECIMAL(12,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_total_non_negative'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_total_non_negative CHECK (total IS NULL OR total >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_user_status
  ON public.orders (user_id, status);

-- 5) Add missing order_items table
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  price DECIMAL(12,2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);

-- 6) Add DB-backed cart table (keeps existing local cart intact; additive)
CREATE TABLE IF NOT EXISTS public.cart (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_user_id ON public.cart (user_id);
CREATE INDEX IF NOT EXISTS idx_cart_product_id ON public.cart (product_id);

-- 7) Subscriptions hardening aliases/indexes
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS expiry TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON public.subscriptions (user_id, status);

-- 8) Leads reseller scoping
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_reseller_id ON public.leads (reseller_id);

-- 9) Unified logs and metrics tables (additive; existing specialized tables remain)
CREATE TABLE IF NOT EXISTS public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL DEFAULT 0,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_ts ON public.logs (ts DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_ts ON public.metrics (ts DESC);

-- 10) Audit log compatibility aliases while preserving existing audit_logs table
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ts TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ts ON public.audit_logs (ts DESC);

