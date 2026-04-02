-- Marketplace/Payment gap fix extension (additive only)

-- -----------------------------
-- 1) Orders/Payments/Webhooks
-- -----------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_order_id UUID UNIQUE REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  payment_method TEXT,
  idempotency_key TEXT UNIQUE,
  retry_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_orders
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'success', 'failed', 'refunded')),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS gateway_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_orders_idempotency_key
  ON public.marketplace_orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  gateway TEXT NOT NULL DEFAULT 'manual',
  gateway_reference TEXT,
  gateway_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  idempotency_key TEXT UNIQUE,
  retry_count INTEGER NOT NULL DEFAULT 0,
  signature_verified BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT,
  event_type TEXT,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'duplicate')),
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  attempts INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhooks_provider_event
  ON public.webhooks (provider, event_id)
  WHERE event_id IS NOT NULL;

-- -----------------------------
-- 2) Subscription renewal fields
-- -----------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS failed_retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_failed_retries INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_renewal_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL;

-- -----------------------------
-- 3) User history support
-- -----------------------------
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apk_downloads_user_created ON public.apk_downloads (user_id, created_at DESC);

-- -----------------------------
-- 4) Reseller tier + commission logs
-- -----------------------------
ALTER TABLE public.resellers
  ADD COLUMN IF NOT EXISTS tier_level TEXT NOT NULL DEFAULT 'silver' CHECK (tier_level IN ('silver', 'gold', 'platinum'));

CREATE TABLE IF NOT EXISTS public.reseller_commission_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID REFERENCES public.resellers(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'credited' CHECK (status IN ('credited', 'reversed', 'withdrawn')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------
-- 5) Wallet ledger + locking/refund
-- -----------------------------
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS locked_balance DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('credit', 'debit', 'lock', 'unlock', 'refund')),
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 0),
  balance_before DECIMAL(12,2),
  balance_after DECIMAL(12,2),
  reference_type TEXT,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet_created ON public.wallet_ledger (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created ON public.wallet_ledger (user_id, created_at DESC);

-- -----------------------------
-- 6) Async jobs table
-- -----------------------------
CREATE TABLE IF NOT EXISTS public.async_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('apk_build', 'email', 'webhook_retry', 'subscription_cron')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_async_jobs_status_run_at ON public.async_jobs (status, run_at);

-- -----------------------------
-- 7) updated_at triggers
-- -----------------------------
DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_async_jobs_updated_at ON public.async_jobs;
CREATE TRIGGER trg_async_jobs_updated_at
  BEFORE UPDATE ON public.async_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------
-- 8) RLS policies
-- -----------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_commission_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.async_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='Users can view own orders_v2') THEN
    CREATE POLICY "Users can view own orders_v2" ON public.orders FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='Users can insert own orders_v2') THEN
    CREATE POLICY "Users can insert own orders_v2" ON public.orders FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='Super admin full access orders_v2') THEN
    CREATE POLICY "Super admin full access orders_v2" ON public.orders FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payments' AND policyname='Users can view own payments_v2') THEN
    CREATE POLICY "Users can view own payments_v2" ON public.payments FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payments' AND policyname='Users can insert own payments_v2') THEN
    CREATE POLICY "Users can insert own payments_v2" ON public.payments FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='payments' AND policyname='Super admin full access payments_v2') THEN
    CREATE POLICY "Super admin full access payments_v2" ON public.payments FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='webhooks' AND policyname='Super admin full access webhooks_v2') THEN
    CREATE POLICY "Super admin full access webhooks_v2" ON public.webhooks FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reseller_commission_logs' AND policyname='Resellers can view own commission logs') THEN
    CREATE POLICY "Resellers can view own commission logs" ON public.reseller_commission_logs
      FOR SELECT USING (
        reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reseller_commission_logs' AND policyname='Super admin full access reseller_commission_logs') THEN
    CREATE POLICY "Super admin full access reseller_commission_logs" ON public.reseller_commission_logs FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='wallet_ledger' AND policyname='Users can view own wallet ledger') THEN
    CREATE POLICY "Users can view own wallet ledger" ON public.wallet_ledger FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='wallet_ledger' AND policyname='Super admin full access wallet_ledger') THEN
    CREATE POLICY "Super admin full access wallet_ledger" ON public.wallet_ledger FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='async_jobs' AND policyname='Authenticated can view async jobs') THEN
    CREATE POLICY "Authenticated can view async jobs" ON public.async_jobs FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='async_jobs' AND policyname='Super admin manage async jobs') THEN
    CREATE POLICY "Super admin manage async jobs" ON public.async_jobs FOR ALL USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;
