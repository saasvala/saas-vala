-- Reseller key + client module deep fix (additive, no deletion)

-- 1) Ensure clients table exists for reseller-linked client records
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, email)
);

CREATE INDEX IF NOT EXISTS idx_clients_reseller_id_created_at
  ON public.clients (reseller_id, created_at DESC);

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'Resellers can view own clients'
  ) THEN
    CREATE POLICY "Resellers can view own clients" ON public.clients
      FOR SELECT USING (
        reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'Resellers can insert own clients'
  ) THEN
    CREATE POLICY "Resellers can insert own clients" ON public.clients
      FOR INSERT WITH CHECK (
        reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'Resellers can update own clients'
  ) THEN
    CREATE POLICY "Resellers can update own clients" ON public.clients
      FOR UPDATE USING (
        reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
      )
      WITH CHECK (
        reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'Super admin full access clients'
  ) THEN
    CREATE POLICY "Super admin full access clients" ON public.clients
      FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

-- 2) Add client linkage + idempotency to license keys
ALTER TABLE public.license_keys
  ADD COLUMN IF NOT EXISTS reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_license_keys_reseller_id ON public.license_keys (reseller_id);
CREATE INDEX IF NOT EXISTS idx_license_keys_client_id ON public.license_keys (client_id);
CREATE INDEX IF NOT EXISTS idx_license_keys_idempotency_key ON public.license_keys (idempotency_key);

-- Keep keys unique globally and enforce reseller-scoped unique key just in case
CREATE UNIQUE INDEX IF NOT EXISTS idx_license_keys_reseller_license_key
  ON public.license_keys (reseller_id, license_key)
  WHERE reseller_id IS NOT NULL;

-- 3) Extend orders for reseller/client/qty + idempotency coherence
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reseller_id UUID REFERENCES public.resellers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qty INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status_text TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_reseller_id ON public.orders (reseller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON public.orders (client_id, created_at DESC);

-- 4) Support lock transaction type in legacy transactions table
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    WHERE t.typname = 'transaction_type'
  ) THEN
    BEGIN
      ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'lock';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- 5) Ensure reseller commission logs support reseller order references
ALTER TABLE public.reseller_commission_logs
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reseller_commission_logs_reseller_created
  ON public.reseller_commission_logs (reseller_id, created_at DESC);

-- 6) Backward compatibility for historical reseller rows that use commission_rate
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS commission_rate DECIMAL(5,2) DEFAULT 10;

-- 7) No-negative-wallet protection
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wallets_balance_non_negative'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.wallets
      ADD CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wallets_locked_balance_non_negative'
      AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE public.wallets
      ADD CONSTRAINT wallets_locked_balance_non_negative CHECK (locked_balance >= 0);
  END IF;
END $$;
