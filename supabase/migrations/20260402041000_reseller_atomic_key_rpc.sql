-- Atomic reseller key generation RPC

CREATE OR REPLACE FUNCTION public.generate_reseller_keys_atomic(
  p_product_id UUID,
  p_client_name TEXT,
  p_client_email TEXT,
  p_client_phone TEXT,
  p_quantity INTEGER,
  p_cost_per_key NUMERIC,
  p_min_balance NUMERIC DEFAULT 50,
  p_idempotency_key TEXT DEFAULT NULL,
  p_key_type TEXT DEFAULT 'yearly',
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_default_commission_rate NUMERIC := 10;
  v_user_id UUID := auth.uid();
  v_reseller_id UUID;
  v_wallet RECORD;
  v_client RECORD;
  v_order RECORD;
  v_total_cost NUMERIC;
  v_available NUMERIC;
  v_deficit NUMERIC;
  v_idempotency_key TEXT;
  v_now TIMESTAMPTZ := now();
  v_key TEXT;
  v_key_row RECORD;
  v_keys JSONB := '[]'::jsonb;
  v_commission_rate NUMERIC := 10;
  v_commission_amount NUMERIC := 0;
  v_existing_order RECORD;
  v_i INTEGER;
  v_attempts INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'message', 'Unauthorized');
  END IF;

  IF p_product_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'message', 'Missing product_id');
  END IF;

  IF COALESCE(p_quantity, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'message', 'Quantity must be greater than 0');
  END IF;

  IF COALESCE(p_cost_per_key, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'message', 'Cost per key must be greater than 0');
  END IF;

  SELECT id,
         COALESCE(commission_percent, commission_rate, v_default_commission_rate) AS commission_rate
  INTO v_reseller_id, v_commission_rate
  FROM public.resellers
  WHERE user_id = v_user_id
    AND COALESCE(is_active, true) = true
  LIMIT 1;

  IF v_reseller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'RESELLER_NOT_FOUND', 'message', 'Active reseller account not found');
  END IF;

  v_idempotency_key := COALESCE(NULLIF(trim(p_idempotency_key), ''), gen_random_uuid()::text);
  v_total_cost := ROUND((p_cost_per_key * p_quantity)::numeric, 2);

  SELECT * INTO v_existing_order
  FROM public.orders
  WHERE user_id = v_user_id
    AND idempotency_key = v_idempotency_key
  LIMIT 1;

  IF v_existing_order.id IS NOT NULL THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', lk.id,
          'license_key', lk.license_key,
          'status', lk.status,
          'expires_at', lk.expires_at,
          'client_id', lk.client_id
        ) ORDER BY lk.created_at ASC
      ),
      '[]'::jsonb
    )
    INTO v_keys
    FROM public.license_keys lk
    WHERE lk.created_by = v_user_id
      AND lk.idempotency_key = v_idempotency_key;

    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'idempotency_key', v_idempotency_key,
      'order_id', v_existing_order.id,
      'client_id', v_existing_order.client_id,
      'quantity', COALESCE(v_existing_order.qty, jsonb_array_length(v_keys)),
      'total_cost', v_existing_order.amount,
      'keys', v_keys
    );
  END IF;

  SELECT id, balance, locked_balance
  INTO v_wallet
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_wallet.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'WALLET_NOT_FOUND', 'message', 'Wallet not found');
  END IF;

  IF COALESCE(v_wallet.balance, 0) < COALESCE(p_min_balance, 0) THEN
    v_deficit := ROUND((COALESCE(p_min_balance, 0) - COALESCE(v_wallet.balance, 0))::numeric, 2);
    RETURN jsonb_build_object(
      'success', false,
      'code', 'MIN_BALANCE_REQUIRED',
      'message', 'Minimum balance requirement not met',
      'deficit', GREATEST(v_deficit, 0),
      'minimum_balance', COALESCE(p_min_balance, 0),
      'balance', COALESCE(v_wallet.balance, 0),
      'required_total', v_total_cost
    );
  END IF;

  v_available := COALESCE(v_wallet.balance, 0) - COALESCE(v_wallet.locked_balance, 0);
  IF v_available < v_total_cost THEN
    v_deficit := ROUND((v_total_cost - v_available)::numeric, 2);
    RETURN jsonb_build_object(
      'success', false,
      'code', 'INSUFFICIENT_BALANCE',
      'message', 'Insufficient wallet balance',
      'deficit', GREATEST(v_deficit, 0),
      'minimum_balance', COALESCE(p_min_balance, 0),
      'balance', COALESCE(v_wallet.balance, 0),
      'available', v_available,
      'required_total', v_total_cost
    );
  END IF;

  -- lock amount
  UPDATE public.wallets
  SET locked_balance = COALESCE(locked_balance, 0) + v_total_cost,
      updated_at = v_now
  WHERE id = v_wallet.id;

  INSERT INTO public.wallet_ledger (
    wallet_id, user_id, entry_type, amount, balance_before, balance_after,
    reference_type, reference_id, metadata
  ) VALUES (
    v_wallet.id, v_user_id, 'lock', v_total_cost, COALESCE(v_wallet.balance, 0), COALESCE(v_wallet.balance, 0),
    'reseller_key_generation', v_idempotency_key,
    jsonb_build_object('quantity', p_quantity, 'cost_per_key', p_cost_per_key)
  );

  INSERT INTO public.transactions (
    wallet_id, type, amount, balance_after, status, description, reference_id, reference_type, created_by, meta
  ) VALUES (
    v_wallet.id, 'lock', v_total_cost, COALESCE(v_wallet.balance, 0), 'completed',
    'Amount locked for reseller key generation', v_idempotency_key, 'reseller_key_generation_lock', v_user_id,
    jsonb_build_object('quantity', p_quantity, 'cost_per_key', p_cost_per_key)
  );

  -- create or reuse client
  IF p_client_email IS NOT NULL AND length(trim(p_client_email)) > 0 THEN
    SELECT * INTO v_client
    FROM public.clients
    WHERE reseller_id = v_reseller_id
      AND lower(email) = lower(trim(p_client_email))
    LIMIT 1;

    IF v_client.id IS NULL THEN
      INSERT INTO public.clients (reseller_id, name, email, phone)
      VALUES (v_reseller_id, trim(p_client_name), trim(p_client_email), NULLIF(trim(p_client_phone), ''))
      RETURNING * INTO v_client;
    ELSE
      UPDATE public.clients
      SET name = COALESCE(NULLIF(trim(p_client_name), ''), name),
          phone = COALESCE(NULLIF(trim(p_client_phone), ''), phone),
          updated_at = v_now
      WHERE id = v_client.id
      RETURNING * INTO v_client;
    END IF;
  ELSE
    INSERT INTO public.clients (reseller_id, name, email, phone)
    VALUES (v_reseller_id, trim(p_client_name), NULL, NULLIF(trim(p_client_phone), ''))
    RETURNING * INTO v_client;
  END IF;

  -- generate keys
  FOR v_i IN 1..p_quantity LOOP
    v_attempts := 0;
    LOOP
      v_attempts := v_attempts + 1;
      v_key := public.generate_license_key();
      BEGIN
        INSERT INTO public.license_keys (
          product_id, license_key, key_type, status,
          owner_email, owner_name,
          max_devices, activated_devices,
          created_by, reseller_id, client_id,
          expires_at, activated_at,
          notes, idempotency_key,
          meta
        ) VALUES (
          p_product_id,
          v_key,
          COALESCE(NULLIF(trim(p_key_type), ''), 'yearly')::public.key_type,
          'active',
          NULLIF(trim(p_client_email), ''),
          NULLIF(trim(p_client_name), ''),
          1,
          0,
          v_user_id,
          v_reseller_id,
          v_client.id,
          p_expires_at,
          v_now,
          'Generated via reseller atomic flow',
          v_idempotency_key,
          jsonb_build_object('source', 'reseller_atomic_generate', 'idempotency_key', v_idempotency_key)
        )
        RETURNING * INTO v_key_row;

        v_keys := v_keys || jsonb_build_array(
          jsonb_build_object(
            'id', v_key_row.id,
            'license_key', v_key_row.license_key,
            'status', v_key_row.status,
            'expires_at', v_key_row.expires_at,
            'client_id', v_key_row.client_id
          )
        );

        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempts >= 10 THEN
          RAISE EXCEPTION 'Unable to generate unique license key after % attempts', v_attempts;
        END IF;
      END;
    END LOOP;
  END LOOP;

  -- deduct wallet from locked amount
  UPDATE public.wallets
  SET balance = COALESCE(balance, 0) - v_total_cost,
      locked_balance = GREATEST(0, COALESCE(locked_balance, 0) - v_total_cost),
      updated_at = v_now
  WHERE id = v_wallet.id;

  INSERT INTO public.transactions (
    wallet_id, type, amount, balance_after, status, description, reference_id, reference_type, created_by, meta
  ) VALUES (
    v_wallet.id, 'debit', v_total_cost, (SELECT balance FROM public.wallets WHERE id = v_wallet.id), 'completed',
    format('Generated %s license key(s)', p_quantity), v_idempotency_key, 'reseller_key_generation', v_user_id,
    jsonb_build_object('quantity', p_quantity, 'client_id', v_client.id)
  );

  INSERT INTO public.wallet_ledger (
    wallet_id, user_id, entry_type, amount, balance_before, balance_after,
    reference_type, reference_id, metadata
  ) VALUES (
    v_wallet.id, v_user_id, 'debit', v_total_cost,
    COALESCE(v_wallet.balance, 0),
    COALESCE(v_wallet.balance, 0) - v_total_cost,
    'reseller_key_generation', v_idempotency_key,
    jsonb_build_object('quantity', p_quantity, 'client_id', v_client.id)
  );

  -- unlock consumed lock (audit trail)
  INSERT INTO public.wallet_ledger (
    wallet_id, user_id, entry_type, amount, balance_before, balance_after,
    reference_type, reference_id, metadata
  ) VALUES (
    v_wallet.id, v_user_id, 'unlock', v_total_cost,
    COALESCE(v_wallet.balance, 0) - v_total_cost,
    COALESCE(v_wallet.balance, 0) - v_total_cost,
    'reseller_key_generation', v_idempotency_key,
    jsonb_build_object('reason', 'consume_locked_amount')
  );

  -- create order
  INSERT INTO public.orders (
    user_id, reseller_id, client_id, product_id, qty, amount, currency,
    status, status_text, payment_method, idempotency_key, metadata
  ) VALUES (
    v_user_id, v_reseller_id, v_client.id, p_product_id, p_quantity, v_total_cost, 'INR',
    'success', 'completed', 'wallet', v_idempotency_key,
    jsonb_build_object('source', 'reseller_atomic_generate', 'cost_per_key', p_cost_per_key)
  )
  RETURNING * INTO v_order;

  -- commission
  v_commission_amount := ROUND((v_total_cost * COALESCE(v_commission_rate, v_default_commission_rate) / 100.0)::numeric, 2);

  INSERT INTO public.reseller_commission_logs (
    reseller_id, order_id, client_id,
    commission_rate, amount, status, metadata
  ) VALUES (
    v_reseller_id, v_order.id, v_client.id,
    COALESCE(v_commission_rate, v_default_commission_rate), v_commission_amount, 'credited',
    jsonb_build_object('quantity', p_quantity, 'idempotency_key', v_idempotency_key)
  );

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'idempotency_key', v_idempotency_key,
    'order_id', v_order.id,
    'client_id', v_client.id,
    'quantity', p_quantity,
    'total_cost', v_total_cost,
    'commission_amount', v_commission_amount,
    'commission_rate', COALESCE(v_commission_rate, v_default_commission_rate),
    'keys', v_keys
  );
END;
$$;
