-- Marketplace action system additive schema
-- Adds missing compatibility tables for cart, comments, and promo tracking.

CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.product_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  message TEXT NOT NULL CHECK (length(trim(message)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promo_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  conversions INTEGER NOT NULL DEFAULT 0 CHECK (conversions >= 0),
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON public.cart_items (user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items (product_id);
CREATE INDEX IF NOT EXISTS idx_product_comments_product_created ON public.product_comments (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_comments_user_created ON public.product_comments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_links_owner_id ON public.promo_links (owner_id);
CREATE INDEX IF NOT EXISTS idx_promo_links_product_id ON public.promo_links (product_id);
CREATE INDEX IF NOT EXISTS idx_promo_links_code ON public.promo_links (code);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_links ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='cart_items' AND policyname='Users manage own cart_items'
  ) THEN
    CREATE POLICY "Users manage own cart_items"
      ON public.cart_items
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='product_comments' AND policyname='Authenticated read product_comments'
  ) THEN
    CREATE POLICY "Authenticated read product_comments"
      ON public.product_comments
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='product_comments' AND policyname='Users insert own product_comments'
  ) THEN
    CREATE POLICY "Users insert own product_comments"
      ON public.product_comments
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='promo_links' AND policyname='Users read own promo_links'
  ) THEN
    CREATE POLICY "Users read own promo_links"
      ON public.promo_links
      FOR SELECT
      TO authenticated
      USING (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='promo_links' AND policyname='Users insert own promo_links'
  ) THEN
    CREATE POLICY "Users insert own promo_links"
      ON public.promo_links
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='promo_links' AND policyname='Users update own promo_links'
  ) THEN
    CREATE POLICY "Users update own promo_links"
      ON public.promo_links
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_cart_items_updated_at ON public.cart_items;
CREATE TRIGGER trg_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_promo_links_updated_at ON public.promo_links;
CREATE TRIGGER trg_promo_links_updated_at
  BEFORE UPDATE ON public.promo_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
