-- Ultra DB index boost (additive-only, no destructive operations)
-- Ensures requested performance indexes exist for core flow tables.

DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'users'
        AND indexdef ILIKE '%(id, email)%'
    )
  THEN
    CREATE INDEX idx_users_id_email ON public.users (id, email);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'products'
        AND indexdef ILIKE '%(id, category_id)%'
    )
  THEN
    CREATE INDEX idx_products_id_category_id ON public.products (id, category_id);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'orders'
        AND indexdef ILIKE '%(user_id, status)%'
    )
  THEN
    CREATE INDEX idx_orders_user_id_status ON public.orders (user_id, status);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.transactions') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'transactions'
        AND indexdef ILIKE '%(user_id, created_at)%'
    )
  THEN
    CREATE INDEX idx_transactions_user_id_created_at ON public.transactions (user_id, created_at DESC);
  END IF;
END $$;
