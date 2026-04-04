-- FINAL E2E GAP PATCH (additive only)
-- Adds missing production controls without destructive changes.

-- 1) Global payment -> order -> wallet -> key atomic finalize wrapper
CREATE OR REPLACE FUNCTION public.gateway_payment_finalize_atomic(
  p_payment_id UUID,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_license public.license_keys%ROWTYPE;
  v_generated_license_key TEXT;
  v_paid_at TIMESTAMPTZ := now();
  v_locked NUMERIC := 0;
  v_order_amount NUMERIC := 0;
  v_unlock_amount NUMERIC := 0;
  v_gateway TEXT := '';
  v_is_wallet_gateway BOOLEAN := false;
  v_old_balance NUMERIC := 0;
  v_final_balance NUMERIC := 0;
  v_next_locked NUMERIC := 0;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PAYMENT_NOT_FOUND');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_payment.order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  IF v_order.status = 'success' THEN
    SELECT * INTO v_license
    FROM public.license_keys
    WHERE meta->>'order_id' = v_order.id::text
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'ok', true,
      'already_processed', true,
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'user_id', v_order.user_id,
      'product_id', v_order.product_id,
      'amount', v_order.amount,
      'currency', COALESCE(v_order.currency, 'INR'),
      'tenant_id', v_order.tenant_id,
      'license_key_id', v_license.id,
      'license_key', v_license.license_key
    );
  END IF;

  UPDATE public.payments
  SET
    status = 'success',
    signature_verified = true,
    updated_at = v_paid_at
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  UPDATE public.orders
  SET
    status = 'success',
    updated_at = v_paid_at
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  IF v_order.marketplace_order_id IS NOT NULL THEN
    UPDATE public.marketplace_orders
    SET
      status = 'completed',
      payment_status = 'success',
      completed_at = v_paid_at
    WHERE id = v_order.marketplace_order_id;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_order.user_id
  FOR UPDATE;

  IF v_wallet.id IS NOT NULL THEN
    v_locked := COALESCE(v_wallet.locked_balance, 0);
    v_order_amount := COALESCE(v_order.amount, 0);
    v_gateway := lower(COALESCE(v_payment.gateway, ''));
    v_is_wallet_gateway := (v_gateway = 'wallet');

    IF v_locked > 0 THEN
      v_unlock_amount := LEAST(v_locked, v_order_amount);
      v_old_balance := COALESCE(v_wallet.balance, 0);
      v_final_balance := CASE WHEN v_is_wallet_gateway THEN GREATEST(0, v_old_balance - v_unlock_amount) ELSE v_old_balance END;
      v_next_locked := GREATEST(0, v_locked - v_unlock_amount);

      UPDATE public.wallets
      SET
        balance = v_final_balance,
        locked_balance = v_next_locked,
        updated_at = v_paid_at
      WHERE id = v_wallet.id
      RETURNING * INTO v_wallet;

      IF v_is_wallet_gateway THEN
        INSERT INTO public.transactions (
          wallet_id, type, amount, balance_after, status, description, reference_type, reference_id, created_by, tenant_id
        ) VALUES (
          v_wallet.id,
          'debit',
          v_unlock_amount,
          v_final_balance,
          'completed',
          'Payment settled from wallet',
          'order_payment',
          v_order.id::text,
          COALESCE(p_actor_user_id, v_order.user_id),
          v_order.tenant_id
        );
      END IF;

      INSERT INTO public.wallet_ledger (
        wallet_id, user_id, entry_type, amount, balance_before, balance_after, reference_type, reference_id, metadata, tenant_id
      ) VALUES (
        v_wallet.id,
        v_order.user_id,
        CASE WHEN v_is_wallet_gateway THEN 'debit' ELSE 'unlock' END,
        v_unlock_amount,
        v_old_balance,
        v_final_balance,
        'order',
        v_order.id::text,
        jsonb_build_object('reason', CASE WHEN v_is_wallet_gateway THEN 'payment_success_wallet_debit' ELSE 'payment_success_unlock' END),
        v_order.tenant_id
      );
    END IF;
  END IF;

  SELECT * INTO v_license
  FROM public.license_keys
  WHERE meta->>'order_id' = v_order.id::text
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_license.id IS NULL AND v_order.product_id IS NOT NULL THEN
    v_generated_license_key :=
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    INSERT INTO public.license_keys (
      product_id, license_key, key_type, status, owner_email, owner_name, max_devices,
      activated_devices, activated_at, expires_at, created_by, notes, meta
    )
    VALUES (
      v_order.product_id,
      v_generated_license_key,
      'monthly',
      'active',
      NULL,
      NULL,
      1,
      0,
      v_paid_at,
      (v_paid_at + interval '30 day'),
      COALESCE(p_actor_user_id, v_order.user_id),
      'Auto-generated by gateway_payment_finalize_atomic',
      jsonb_build_object('order_id', v_order.id, 'payment_id', v_payment.id)
    )
    RETURNING * INTO v_license;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'already_processed', false,
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'user_id', v_order.user_id,
    'product_id', v_order.product_id,
    'amount', v_order.amount,
    'currency', COALESCE(v_order.currency, 'INR'),
    'tenant_id', v_order.tenant_id,
    'license_key_id', v_license.id,
    'license_key', v_license.license_key
  );
END;
$$;

-- 2) Distributed event topic contract coverage
CREATE TABLE IF NOT EXISTS public.event_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_key TEXT NOT NULL UNIQUE,
  transport TEXT NOT NULL DEFAULT 'redis_streams' CHECK (transport IN ('redis_streams', 'kafka', 'native_queue')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.event_topics (topic_key, transport, is_active)
VALUES
  ('payment_success', 'redis_streams', true),
  ('apk_ready', 'redis_streams', true),
  ('builder_complete', 'redis_streams', true),
  ('user_signup', 'redis_streams', true)
ON CONFLICT (topic_key) DO UPDATE
SET transport = EXCLUDED.transport, is_active = EXCLUDED.is_active;

CREATE INDEX IF NOT EXISTS idx_event_bus_event_type_status_created
  ON public.event_bus(event_type, status, created_at ASC);

-- 3) Service health auto-restart controls
CREATE TABLE IF NOT EXISTS public.service_restart_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL UNIQUE,
  memory_limit_mb INTEGER NOT NULL DEFAULT 1024,
  leak_restart_threshold INTEGER NOT NULL DEFAULT 3,
  restart_cooldown_seconds INTEGER NOT NULL DEFAULT 60,
  auto_restart_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_restarts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  memory_mb NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_restarts_service_status_created
  ON public.service_restarts(service_name, status, created_at DESC);

-- 4) DB index master plan (broad critical fields)
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON public.orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_status_created_at ON public.payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user_id_created_at ON public.payments(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_license_keys_product_id_created_at ON public.license_keys(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_license_keys_status_created_at ON public.license_keys(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status_created_at ON public.transactions(status, created_at DESC);

-- 5) File versioning for APK + builder outputs
CREATE TABLE IF NOT EXISTS public.file_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_scope TEXT NOT NULL CHECK (file_scope IN ('apk', 'builder_artifact', 'release_bundle')),
  file_ref_id UUID,
  version_label TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  checksum TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(file_scope, file_ref_id, version_label)
);

CREATE INDEX IF NOT EXISTS idx_file_versions_scope_ref_created
  ON public.file_versions(file_scope, file_ref_id, created_at DESC);

-- 6) Disaster recovery tracking
CREATE TABLE IF NOT EXISTS public.disaster_recovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_log_id UUID REFERENCES public.backup_logs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed')),
  restore_target TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- 7) API circuit breaker
CREATE TABLE IF NOT EXISTS public.api_circuit_breakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key TEXT NOT NULL UNIQUE,
  failure_count INTEGER NOT NULL DEFAULT 0,
  failure_threshold INTEGER NOT NULL DEFAULT 5,
  state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
  opened_at TIMESTAMPTZ,
  cool_down_seconds INTEGER NOT NULL DEFAULT 60,
  last_error TEXT,
  fallback_strategy TEXT DEFAULT 'graceful_degrade',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8) Bot/fraud protection event capture
CREATE TABLE IF NOT EXISTS public.bot_fraud_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address TEXT,
  device_fingerprint TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('captcha_failed', 'captcha_passed', 'behavior_anomaly', 'rate_limit_burst', 'fraud_blocked')),
  risk_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_fraud_events_user_created
  ON public.bot_fraud_events(user_id, created_at DESC);

-- 9) Admin override audit controls
CREATE TABLE IF NOT EXISTS public.admin_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('pending', 'applied', 'reverted')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10) Log rotation + dead-link safety + continuous test tracking
CREATE TABLE IF NOT EXISTS public.log_rotation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  rotated_rows BIGINT DEFAULT 0,
  archived_to TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('queued', 'running', 'success', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.route_safety_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  status_code INTEGER,
  is_dead_link BOOLEAN NOT NULL DEFAULT false,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.continuous_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deploy_ref TEXT,
  suite_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'passed', 'failed')),
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- 11) Multi-region + cold start + secret reference registry
CREATE TABLE IF NOT EXISTS public.deployment_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  latency_weight NUMERIC(8,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_warmups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  region_code TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed')),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.secret_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'vault',
  ref_path TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
