-- ULTRA FINAL HARDENING (additive only)
-- Adds: idempotency, cache/search/event/scheduler primitives, backup/dead-letter/config/file metadata,
-- token-bucket extensions, tenant/version columns, and atomic RPCs for critical write flows.

-- 1) Idempotency store
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  endpoint TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT,
  response JSONB,
  status_code INTEGER NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 day'),
  UNIQUE (user_id, endpoint, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_endpoint_created
  ON public.idempotency_keys(endpoint, created_at DESC);

-- 2) Search index queue + event bus
CREATE TABLE IF NOT EXISTS public.event_bus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processed', 'failed')),
  retries INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_event_bus_status_created
  ON public.event_bus(status, created_at ASC);

CREATE TABLE IF NOT EXISTS public.search_index_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine TEXT NOT NULL DEFAULT 'meilisearch' CHECK (engine IN ('meilisearch', 'elasticsearch')),
  index_name TEXT NOT NULL,
  document_id TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'upsert' CHECK (operation IN ('upsert', 'delete')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processed', 'failed')),
  retries INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_search_index_queue_status_created
  ON public.search_index_queue(status, created_at ASC);

-- 3) Scheduler + backup/dead-letter
CREATE TABLE IF NOT EXISTS public.scheduled_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  schedule_hint TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_name_created
  ON public.scheduled_job_runs(job_name, created_at DESC);

CREATE TABLE IF NOT EXISTS public.backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'success', 'failed')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dead_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT NOT NULL,
  source_job_type TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) File metadata + config store
CREATE TABLE IF NOT EXISTS public.file_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  file_type TEXT,
  size_bytes BIGINT,
  checksum TEXT,
  source TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket, path)
);

CREATE TABLE IF NOT EXISTS public.env_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  encrypted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) API versioning helper table
CREATE TABLE IF NOT EXISTS public.api_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.api_versions(version, is_default, is_active)
VALUES ('v1', true, true), ('v2', false, true)
ON CONFLICT (version) DO NOTHING;

-- 6) Feature flag alias columns required by external contracts
ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS rollout_percentage INTEGER;

UPDATE public.feature_flags
SET
  name = COALESCE(name, flag_key),
  enabled = COALESCE(enabled, is_enabled),
  rollout_percentage = COALESCE(rollout_percentage, rollout_percent)
WHERE name IS NULL OR enabled IS NULL OR rollout_percentage IS NULL;

-- 7) Advanced token-bucket rate limit dimensions
ALTER TABLE public.rate_limits
  ADD COLUMN IF NOT EXISTS scope TEXT DEFAULT 'user_endpoint',
  ADD COLUMN IF NOT EXISTS ip TEXT,
  ADD COLUMN IF NOT EXISTS api_key_hash TEXT,
  ADD COLUMN IF NOT EXISTS bucket_tokens NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_refill_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS refill_rate_per_sec NUMERIC DEFAULT 2,
  ADD COLUMN IF NOT EXISTS burst_capacity NUMERIC DEFAULT 120;

CREATE INDEX IF NOT EXISTS idx_rate_limits_scope_user_endpoint
  ON public.rate_limits(scope, user_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_scope_ip_endpoint
  ON public.rate_limits(scope, ip, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_scope_apikey_endpoint
  ON public.rate_limits(scope, api_key_hash, endpoint);

-- 8) Version + tenant additive columns on critical tables
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS api_version TEXT DEFAULT 'v1';

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tenant_id UUID;
  END IF;
  IF to_regclass('public.payments') IS NOT NULL THEN
    ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS tenant_id UUID;
  END IF;
  IF to_regclass('public.wallets') IS NOT NULL THEN
    ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS tenant_id UUID;
  END IF;
  IF to_regclass('public.wallet_ledger') IS NOT NULL THEN
    ALTER TABLE public.wallet_ledger ADD COLUMN IF NOT EXISTS tenant_id UUID;
  END IF;
  IF to_regclass('public.transactions') IS NOT NULL THEN
    ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS tenant_id UUID;
  END IF;
  IF to_regclass('public.marketplace_orders') IS NOT NULL THEN
    ALTER TABLE public.marketplace_orders ADD COLUMN IF NOT EXISTS tenant_id UUID;
  END IF;
  IF to_regclass('public.leads') IS NOT NULL THEN
    ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tenant_id UUID;
  END IF;
  IF to_regclass('public.client_requests') IS NOT NULL THEN
    ALTER TABLE public.client_requests ADD COLUMN IF NOT EXISTS tenant_id UUID;
  END IF;
END $$;

-- 9) Atomic product creation (transaction-safe)
CREATE OR REPLACE FUNCTION public.gateway_create_product_atomic(
  p_user_id UUID,
  p_payload JSONB,
  p_request_key TEXT DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := NULLIF(trim(COALESCE(p_request_key, '')), '');
  v_existing JSONB;
  v_product public.products%ROWTYPE;
BEGIN
  IF v_key IS NOT NULL THEN
    SELECT response INTO v_existing
    FROM public.idempotency_keys
    WHERE user_id = p_user_id
      AND endpoint = 'products/create'
      AND key = v_key
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  INSERT INTO public.products (
    name, slug, description, category_id, status, price, currency, version, features,
    created_by, git_repo_url, git_repo_name, git_default_branch, deploy_status,
    marketplace_visible, demo_url, live_url, tenant_id, api_version
  ) VALUES (
    COALESCE(p_payload->>'name', ''),
    COALESCE(NULLIF(p_payload->>'slug', ''), regexp_replace(lower(COALESCE(p_payload->>'name', '')), '[^a-z0-9]+', '-', 'g')),
    NULLIF(p_payload->>'description', ''),
    NULLIF(p_payload->>'category_id', ''),
    COALESCE(NULLIF(p_payload->>'status', ''), 'draft'),
    COALESCE((p_payload->>'price')::numeric, 0),
    COALESCE(NULLIF(p_payload->>'currency', ''), 'INR'),
    COALESCE(NULLIF(p_payload->>'version', ''), '1.0.0'),
    COALESCE(p_payload->'features', '[]'::jsonb),
    p_user_id,
    NULLIF(p_payload->>'git_repo_url', ''),
    NULLIF(p_payload->>'git_repo_name', ''),
    COALESCE(NULLIF(p_payload->>'git_default_branch', ''), 'main'),
    COALESCE(NULLIF(p_payload->>'deploy_status', ''), 'idle'),
    COALESCE((p_payload->>'marketplace_visible')::boolean, false),
    NULLIF(p_payload->>'demo_url', ''),
    NULLIF(p_payload->>'live_url', ''),
    p_tenant_id,
    COALESCE(NULLIF(p_payload->>'api_version', ''), 'v1')
  )
  RETURNING * INTO v_product;

  v_existing := jsonb_build_object('product', to_jsonb(v_product));

  IF v_key IS NOT NULL THEN
    INSERT INTO public.idempotency_keys(user_id, endpoint, key, response, status_code)
    VALUES (p_user_id, 'products/create', v_key, v_existing, 201)
    ON CONFLICT (user_id, endpoint, key) DO UPDATE
    SET response = EXCLUDED.response, status_code = EXCLUDED.status_code;
  END IF;

  RETURN v_existing;
END;
$$;

-- 10) Atomic marketplace payment init / order flow (transaction-safe)
CREATE OR REPLACE FUNCTION public.gateway_payment_init_atomic(
  p_user_id UUID,
  p_product_id UUID,
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'INR',
  p_payment_method TEXT DEFAULT 'gateway',
  p_gateway TEXT DEFAULT 'manual',
  p_gateway_reference TEXT DEFAULT NULL,
  p_meta JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL,
  p_lock_wallet BOOLEAN DEFAULT false,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_order public.orders%ROWTYPE;
  v_product_owner UUID;
  v_marketplace_order public.marketplace_orders%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_available NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  IF NULLIF(trim(COALESCE(p_idempotency_key, '')), '') IS NOT NULL THEN
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE idempotency_key = p_idempotency_key
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_existing_order.id IS NOT NULL THEN
      RETURN jsonb_build_object('order', to_jsonb(v_existing_order), 'duplicate', true);
    END IF;
  END IF;

  SELECT created_by INTO v_product_owner FROM public.products WHERE id = p_product_id LIMIT 1;
  IF v_product_owner IS NULL THEN
    RAISE EXCEPTION 'Product not found or missing seller';
  END IF;

  INSERT INTO public.marketplace_orders (
    buyer_id, seller_id, amount, final_amount, subtotal, product_id, status, payment_status, payment_method,
    idempotency_key, retry_count, tenant_id
  )
  VALUES (
    p_user_id, v_product_owner, p_amount, p_amount, p_amount, p_product_id, 'pending', 'pending', p_payment_method,
    p_idempotency_key, 0, p_tenant_id
  )
  RETURNING * INTO v_marketplace_order;

  INSERT INTO public.orders (
    marketplace_order_id, user_id, product_id, amount, currency, status, payment_method, idempotency_key, metadata, tenant_id
  )
  VALUES (
    v_marketplace_order.id, p_user_id, p_product_id, p_amount, COALESCE(NULLIF(p_currency, ''), 'INR'),
    'pending', p_payment_method, p_idempotency_key, COALESCE(p_meta, '{}'::jsonb), p_tenant_id
  )
  RETURNING * INTO v_order;

  INSERT INTO public.payments (
    order_id, user_id, amount, currency, gateway, gateway_reference, status, idempotency_key, metadata, tenant_id
  )
  VALUES (
    v_order.id, p_user_id, p_amount, COALESCE(NULLIF(p_currency, ''), 'INR'),
    COALESCE(NULLIF(p_gateway, ''), 'manual'),
    NULLIF(p_gateway_reference, ''),
    'pending',
    p_idempotency_key,
    COALESCE(p_meta, '{}'::jsonb),
    p_tenant_id
  )
  RETURNING * INTO v_payment;

  IF p_lock_wallet OR p_payment_method = 'wallet' THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = p_user_id LIMIT 1;
    IF v_wallet.id IS NOT NULL THEN
      v_available := COALESCE(v_wallet.balance, 0) - COALESCE(v_wallet.locked_balance, 0);
      IF v_available < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance';
      END IF;
      UPDATE public.wallets
      SET locked_balance = COALESCE(locked_balance, 0) + p_amount,
          updated_at = now()
      WHERE id = v_wallet.id;

      INSERT INTO public.wallet_ledger (
        wallet_id, user_id, entry_type, amount, balance_before, balance_after, reference_type, reference_id, metadata, tenant_id
      )
      VALUES (
        v_wallet.id, p_user_id, 'lock', p_amount, COALESCE(v_wallet.balance, 0), COALESCE(v_wallet.balance, 0),
        'order', v_order.id, jsonb_build_object('reason', 'payment_init_lock'), p_tenant_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'payment', to_jsonb(v_payment),
    'marketplace_order', to_jsonb(v_marketplace_order)
  );
END;
$$;

-- 11) Atomic wallet mutation (transaction-safe)
CREATE OR REPLACE FUNCTION public.gateway_wallet_mutation_atomic(
  p_user_id UUID,
  p_wallet_id UUID,
  p_entry_type TEXT,
  p_amount NUMERIC,
  p_reference_type TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_meta JSONB DEFAULT '{}'::jsonb,
  p_tenant_id UUID DEFAULT NULL,
  p_request_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_old_balance NUMERIC;
  v_old_locked NUMERIC;
  v_new_balance NUMERIC;
  v_new_locked NUMERIC;
  v_tx public.transactions%ROWTYPE;
  v_existing JSONB;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  IF NULLIF(trim(COALESCE(p_request_key, '')), '') IS NOT NULL THEN
    SELECT response INTO v_existing
    FROM public.idempotency_keys
    WHERE user_id = p_user_id
      AND endpoint = 'wallet/mutation'
      AND key = p_request_key
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE id = p_wallet_id LIMIT 1;
  IF v_wallet.id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;

  v_old_balance := COALESCE(v_wallet.balance, 0);
  v_old_locked := COALESCE(v_wallet.locked_balance, 0);
  v_new_balance := v_old_balance;
  v_new_locked := v_old_locked;

  IF p_entry_type IN ('credit', 'refund') THEN
    v_new_balance := v_old_balance + p_amount;
  ELSIF p_entry_type = 'debit' THEN
    IF (v_old_balance - v_old_locked) < p_amount THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;
    v_new_balance := v_old_balance - p_amount;
  ELSIF p_entry_type = 'lock' THEN
    IF (v_old_balance - v_old_locked) < p_amount THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;
    v_new_locked := v_old_locked + p_amount;
  ELSIF p_entry_type = 'unlock' THEN
    v_new_locked := GREATEST(0, v_old_locked - p_amount);
  ELSE
    RAISE EXCEPTION 'Unsupported entry type';
  END IF;

  UPDATE public.wallets
  SET balance = v_new_balance,
      locked_balance = v_new_locked,
      updated_at = now(),
      tenant_id = COALESCE(tenant_id, p_tenant_id)
  WHERE id = v_wallet.id;

  IF p_entry_type IN ('credit', 'refund', 'debit') THEN
    INSERT INTO public.transactions (
      wallet_id, type, amount, balance_after, status, description, created_by, source,
      reference_id, reference_type, meta, tenant_id
    )
    VALUES (
      v_wallet.id, p_entry_type, p_amount, v_new_balance, 'completed',
      COALESCE(p_description, p_entry_type), p_user_id, p_source,
      p_reference_id, p_reference_type, p_meta, p_tenant_id
    )
    RETURNING * INTO v_tx;
  END IF;

  INSERT INTO public.wallet_ledger (
    wallet_id, user_id, entry_type, amount, balance_before, balance_after, reference_type, reference_id, metadata, tenant_id
  )
  VALUES (
    v_wallet.id, v_wallet.user_id, p_entry_type, p_amount, v_old_balance, v_new_balance,
    p_reference_type, p_reference_id, COALESCE(p_meta, '{}'::jsonb), p_tenant_id
  );

  v_existing := jsonb_build_object(
    'wallet_id', v_wallet.id,
    'balance', v_new_balance,
    'locked_balance', v_new_locked,
    'transaction_id', v_tx.id
  );

  IF NULLIF(trim(COALESCE(p_request_key, '')), '') IS NOT NULL THEN
    INSERT INTO public.idempotency_keys(user_id, endpoint, key, response, status_code)
    VALUES (p_user_id, 'wallet/mutation', p_request_key, v_existing, 200)
    ON CONFLICT (user_id, endpoint, key) DO UPDATE
    SET response = EXCLUDED.response, status_code = EXCLUDED.status_code;
  END IF;

  RETURN v_existing;
END;
$$;

