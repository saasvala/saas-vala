-- SYSTEM CORE AUDIT LOGS HARDENING (additive)
-- Goals:
-- - strict global contract
-- - single mandatory write path
-- - append-only/tamper-evident records
-- - bounded read access
-- - broad CRUD trigger coverage

-- 1) Strict contract fields (additive, backward compatible)
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS event_category text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS target_table text,
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz,
  ADD COLUMN IF NOT EXISTS integrity_version smallint DEFAULT 1,
  ADD COLUMN IF NOT EXISTS integrity_prev_hash text,
  ADD COLUMN IF NOT EXISTS integrity_hash text,
  ADD COLUMN IF NOT EXISTS ingest_source text DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS is_system boolean DEFAULT false;

ALTER TABLE public.audit_logs
  ALTER COLUMN event_category SET DEFAULT 'SYSTEM',
  ALTER COLUMN event_type SET DEFAULT 'unknown',
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN occurred_at SET DEFAULT now(),
  ALTER COLUMN integrity_version SET DEFAULT 1,
  ALTER COLUMN ingest_source SET DEFAULT 'legacy',
  ALTER COLUMN is_system SET DEFAULT false;

UPDATE public.audit_logs
SET
  actor_id = COALESCE(actor_id, user_id),
  user_id = COALESCE(user_id, actor_id),
  target_table = COALESCE(target_table, table_name),
  target_id = COALESCE(target_id, entity_id, record_id::text),
  metadata = COALESCE(metadata, meta, '{}'::jsonb),
  meta = COALESCE(meta, metadata, '{}'::jsonb),
  occurred_at = COALESCE(occurred_at, ts, created_at, now()),
  ts = COALESCE(ts, occurred_at, created_at, now()),
  created_at = COALESCE(created_at, occurred_at, ts, now()),
  event_category = COALESCE(
    event_category,
    CASE
      WHEN action IN ('login', 'logout') THEN 'AUTH'
      WHEN action IN ('create', 'update', 'delete', 'read') THEN 'CRUD'
      WHEN table_name = 'transactions' THEN 'PAYMENT'
      ELSE 'SYSTEM'
    END
  ),
  event_type = COALESCE(event_type, metadata->>'event', action::text, 'unknown'),
  ingest_source = COALESCE(ingest_source, 'legacy'),
  is_system = COALESCE(is_system, false);

ALTER TABLE public.audit_logs
  ALTER COLUMN event_category SET NOT NULL,
  ALTER COLUMN event_type SET NOT NULL,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN occurred_at SET NOT NULL,
  ALTER COLUMN integrity_version SET NOT NULL,
  ALTER COLUMN ingest_source SET NOT NULL,
  ALTER COLUMN is_system SET NOT NULL;

-- Allowed categories for strict taxonomy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_logs_event_category_check'
      AND conrelid = 'public.audit_logs'::regclass
  ) THEN
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_event_category_check
      CHECK (event_category IN ('AUTH', 'CRUD', 'SYSTEM', 'API', 'FILE', 'SECURITY', 'PAYMENT', 'BACKGROUND'));
  END IF;
END $$;

-- 2) Performance indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_category_type_ts ON public.audit_logs (event_category, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_ts ON public.audit_logs (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_ts ON public.audit_logs (target_table, target_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_integrity_prev_hash ON public.audit_logs (integrity_prev_hash);
CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at_brin ON public.audit_logs USING brin (occurred_at);

-- 3) Retention helper (append-only safe: reports candidates, does not delete)
CREATE OR REPLACE FUNCTION public.cleanup_audit_logs_older_than(p_days integer DEFAULT 365)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidates bigint;
BEGIN
  SELECT count(*)
  INTO v_candidates
  FROM public.audit_logs
  WHERE occurred_at < (now() - make_interval(days => GREATEST(p_days, 1)));

  RETURN v_candidates;
END;
$$;

-- 4) Hash-chain support
CREATE OR REPLACE FUNCTION public._audit_chain_hash(p_prev_hash text, p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(coalesce(p_prev_hash, '') || '|' || coalesce(p_payload::text, '{}'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public._audit_logs_before_insert_enforce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_hash text;
  v_payload jsonb;
BEGIN
  NEW.actor_id := COALESCE(NEW.actor_id, NEW.user_id, auth.uid());
  NEW.user_id := COALESCE(NEW.user_id, NEW.actor_id);
  NEW.target_table := COALESCE(NEW.target_table, NEW.table_name, NEW.entity);
  NEW.target_id := COALESCE(NEW.target_id, NEW.entity_id, NEW.record_id::text);
  NEW.metadata := COALESCE(NEW.metadata, NEW.meta, '{}'::jsonb);
  NEW.meta := COALESCE(NEW.meta, NEW.metadata, '{}'::jsonb);
  NEW.occurred_at := COALESCE(NEW.occurred_at, NEW.ts, NEW.created_at, now());
  NEW.ts := COALESCE(NEW.ts, NEW.occurred_at, NEW.created_at, now());
  NEW.created_at := COALESCE(NEW.created_at, NEW.occurred_at, NEW.ts, now());

  IF NEW.event_category IS NULL THEN
    NEW.event_category := CASE
      WHEN NEW.action IN ('login', 'logout') THEN 'AUTH'
      WHEN NEW.action IN ('create', 'update', 'delete', 'read') THEN 'CRUD'
      WHEN NEW.table_name = 'transactions' THEN 'PAYMENT'
      ELSE 'SYSTEM'
    END;
  END IF;

  NEW.event_type := COALESCE(NEW.event_type, NEW.metadata->>'event', NEW.action::text, 'unknown');
  NEW.ingest_source := COALESCE(NEW.ingest_source, 'legacy');
  NEW.is_system := COALESCE(NEW.is_system, false);

  IF NEW.integrity_prev_hash IS NULL THEN
    SELECT integrity_hash
    INTO v_prev_hash
    FROM public.audit_logs
    WHERE integrity_hash IS NOT NULL
    ORDER BY occurred_at DESC, created_at DESC, id DESC
    LIMIT 1;
    NEW.integrity_prev_hash := v_prev_hash;
  END IF;

  v_payload := jsonb_build_object(
    'id', NEW.id,
    'actor_id', NEW.actor_id,
    'action', NEW.action,
    'event_category', NEW.event_category,
    'event_type', NEW.event_type,
    'target_table', NEW.target_table,
    'target_id', NEW.target_id,
    'metadata', NEW.metadata,
    'occurred_at', NEW.occurred_at,
    'ingest_source', NEW.ingest_source,
    'is_system', NEW.is_system
  );

  NEW.integrity_hash := COALESCE(NEW.integrity_hash, public._audit_chain_hash(NEW.integrity_prev_hash, v_payload));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_before_insert_enforce ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_before_insert_enforce
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public._audit_logs_before_insert_enforce();

-- 5) Tamper-proof append-only mutation guard
CREATE OR REPLACE FUNCTION public.prevent_audit_logs_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are immutable (append-only)';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_audit_logs_update ON public.audit_logs;
DROP TRIGGER IF EXISTS trg_prevent_audit_logs_delete ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_logs_update
  BEFORE UPDATE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_logs_mutation();
CREATE TRIGGER trg_prevent_audit_logs_delete
  BEFORE DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_logs_mutation();

-- 6) Read-only access policies
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin full access audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Super admin read audit_logs" ON public.audit_logs;
CREATE POLICY "Super admin read audit_logs"
  ON public.audit_logs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

-- block direct writes for app users (single-path via SECURITY DEFINER function only)
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;

-- 7) Single mandatory write path
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_event_category text,
  p_event_type text,
  p_action public.audit_action DEFAULT 'read',
  p_actor_id uuid DEFAULT auth.uid(),
  p_target_table text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_ingest_source text DEFAULT 'app',
  p_is_system boolean DEFAULT false,
  p_occurred_at timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_table text;
  v_record_id uuid;
BEGIN
  v_table := COALESCE(p_target_table, 'system');
  v_record_id := CASE
    WHEN p_target_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN p_target_id::uuid
    ELSE NULL
  END;

  INSERT INTO public.audit_logs (
    user_id, actor_id, action,
    table_name, record_id, old_data, new_data,
    ip_address, user_agent, created_at,
    entity, entity_id, meta, ts,
    event_category, event_type,
    target_table, target_id, metadata,
    occurred_at, ingest_source, is_system
  )
  VALUES (
    p_actor_id, p_actor_id, p_action,
    v_table, v_record_id, NULL, p_metadata,
    p_ip_address, p_user_agent, p_occurred_at,
    v_table, p_target_id, p_metadata, p_occurred_at,
    UPPER(COALESCE(p_event_category, 'SYSTEM')), COALESCE(p_event_type, 'unknown'),
    v_table, p_target_id, COALESCE(p_metadata, '{}'::jsonb),
    p_occurred_at, COALESCE(p_ingest_source, 'app'), COALESCE(p_is_system, false)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(
  text, text, public.audit_action, uuid, text, text, jsonb, text, text, text, boolean, timestamptz
) TO anon, authenticated, service_role;

-- 8) Bounded read path for performance + scoped querying
CREATE OR REPLACE FUNCTION public.list_audit_logs(
  p_limit integer DEFAULT 100,
  p_before timestamptz DEFAULT NULL,
  p_event_category text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_target_table text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS SETOF public.audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.audit_logs a
  WHERE (p_before IS NULL OR a.occurred_at < p_before)
    AND (p_event_category IS NULL OR a.event_category = UPPER(p_event_category))
    AND (p_event_type IS NULL OR a.event_type = p_event_type)
    AND (p_actor_id IS NULL OR a.actor_id = p_actor_id)
    AND (p_target_table IS NULL OR a.target_table = p_target_table)
    AND (
      p_search IS NULL
      OR a.event_type ILIKE '%' || p_search || '%'
      OR a.target_table ILIKE '%' || p_search || '%'
      OR COALESCE(a.target_id, '') ILIKE '%' || p_search || '%'
      OR COALESCE(a.actor_id::text, '') ILIKE '%' || p_search || '%'
    )
  ORDER BY a.occurred_at DESC, a.id DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_audit_logs(
  integer, timestamptz, text, text, uuid, text, text
) TO authenticated, service_role;

-- 9) Chain verification helper
CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_limit integer DEFAULT 1000)
RETURNS TABLE (
  id uuid,
  occurred_at timestamptz,
  integrity_prev_hash text,
  integrity_hash text,
  recomputed_hash text,
  is_valid boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH ordered AS (
  SELECT
    a.*,
    lag(a.integrity_hash) OVER (ORDER BY a.occurred_at, a.id) AS expected_prev_hash
  FROM public.audit_logs a
  ORDER BY a.occurred_at, a.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 20000)
)
SELECT
  o.id,
  o.occurred_at,
  o.integrity_prev_hash,
  o.integrity_hash,
  public._audit_chain_hash(
    o.integrity_prev_hash,
    jsonb_build_object(
      'id', o.id,
      'actor_id', o.actor_id,
      'action', o.action,
      'event_category', o.event_category,
      'event_type', o.event_type,
      'target_table', o.target_table,
      'target_id', o.target_id,
      'metadata', o.metadata,
      'occurred_at', o.occurred_at,
      'ingest_source', o.ingest_source,
      'is_system', o.is_system
    )
  ) AS recomputed_hash,
  (
    o.integrity_hash = public._audit_chain_hash(
      o.integrity_prev_hash,
      jsonb_build_object(
        'id', o.id,
        'actor_id', o.actor_id,
        'action', o.action,
        'event_category', o.event_category,
        'event_type', o.event_type,
        'target_table', o.target_table,
        'target_id', o.target_id,
        'metadata', o.metadata,
        'occurred_at', o.occurred_at,
        'ingest_source', o.ingest_source,
        'is_system', o.is_system
      )
    )
    AND (o.expected_prev_hash IS NULL OR o.integrity_prev_hash = o.expected_prev_hash)
  ) AS is_valid
FROM ordered o;
$$;

GRANT EXECUTE ON FUNCTION public.verify_audit_chain(integer) TO authenticated, service_role;

-- 10) DB-level mandatory CRUD capture for critical tables
CREATE OR REPLACE FUNCTION public.audit_capture_crud_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.audit_action;
  v_record_id text;
  v_actor uuid;
  v_metadata jsonb;
BEGIN
  IF TG_TABLE_NAME = 'audit_logs' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_action := CASE TG_OP
    WHEN 'INSERT' THEN 'create'::public.audit_action
    WHEN 'UPDATE' THEN 'update'::public.audit_action
    WHEN 'DELETE' THEN 'delete'::public.audit_action
    ELSE 'read'::public.audit_action
  END;

  v_record_id := COALESCE(NEW.id::text, OLD.id::text);
  v_actor := auth.uid();
  v_metadata := jsonb_build_object(
    'operation', TG_OP,
    'schema', TG_TABLE_SCHEMA,
    'table', TG_TABLE_NAME,
    'old_data', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    'new_data', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  PERFORM public.log_audit_event(
    'CRUD',
    lower(TG_OP),
    v_action,
    v_actor,
    TG_TABLE_NAME,
    v_record_id,
    v_metadata,
    NULL,
    NULL,
    'db_trigger',
    true,
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'products',
    'demos',
    'apks',
    'license_keys',
    'wallets',
    'transactions',
    'servers',
    'deployments',
    'leads',
    'resellers',
    'orders',
    'reseller_commission_logs',
    'profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_crud_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_crud_%I
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW
         EXECUTE FUNCTION public.audit_capture_crud_event()',
         t, t
      );
    END IF;
  END LOOP;
END $$;
