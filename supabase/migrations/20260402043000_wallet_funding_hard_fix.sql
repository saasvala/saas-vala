-- Wallet funding hard fix: request -> verify -> credit (manual + webhook)

-- 1) Wallet request table
CREATE TABLE IF NOT EXISTS public.wallet_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL CHECK (amount >= 50),
  method TEXT NOT NULL CHECK (method IN ('bank_transfer', 'upi', 'crypto')),
  txn_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  proof_url TEXT,
  source TEXT NOT NULL DEFAULT 'user_submit',
  signature_valid BOOLEAN,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  credited_tx_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_requests_txn_id_unique
  ON public.wallet_requests (txn_id);
CREATE INDEX IF NOT EXISTS idx_wallet_requests_user_created
  ON public.wallet_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_requests_status_method
  ON public.wallet_requests (status, method, created_at DESC);

DROP TRIGGER IF EXISTS trg_wallet_requests_updated_at ON public.wallet_requests;
CREATE TRIGGER trg_wallet_requests_updated_at
  BEFORE UPDATE ON public.wallet_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Transaction idempotency support for wallet funding credits
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_wallet_request_credit_unique
  ON public.transactions (reference_type, reference_id)
  WHERE reference_type = 'wallet_request_credit';

-- 3) Wallet structural compatibility
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS locked_balance DECIMAL(12,2) NOT NULL DEFAULT 0;

-- 4) RLS
ALTER TABLE public.wallet_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='wallet_requests' AND policyname='Users can view own wallet requests'
  ) THEN
    CREATE POLICY "Users can view own wallet requests"
      ON public.wallet_requests
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='wallet_requests' AND policyname='Users can create own wallet requests'
  ) THEN
    CREATE POLICY "Users can create own wallet requests"
      ON public.wallet_requests
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='wallet_requests' AND policyname='Super admin full access wallet requests'
  ) THEN
    CREATE POLICY "Super admin full access wallet requests"
      ON public.wallet_requests
      FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END $$;
