-- AUDIT LOGS ULTRA FEATURES (additive)
-- Adds: list/search/stats/export/create RPCs, broader table trigger coverage, and indexing.

-- 1) Performance indexing required by audit panel
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name_user_id ON public.audit_logs (table_name, user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);

-- 2) Archive table + helper (copy-style archive to preserve append-only source)
CREATE TABLE IF NOT EXISTS public.audit_logs_archive (LIKE public.audit_logs INCLUDING ALL);

CREATE OR REPLACE FUNCTION public.archive_audit_logs_older_than(
  p_days integer DEFAULT 365,
  p_limit integer DEFAULT 5000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_moved bigint := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  WITH candidates AS (
    SELECT a.*
    FROM public.audit_logs a
    WHERE a.occurred_at < (now() - make_interval(days => GREATEST(p_days, 1)))
      AND NOT EXISTS (
        SELECT 1
        FROM public.audit_logs_archive ar
        WHERE ar.id = a.id
      )
    ORDER BY a.occurred_at ASC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 50000)
  ),
  ins AS (
    INSERT INTO public.audit_logs_archive
    SELECT * FROM candidates
    RETURNING id
  )
  SELECT count(*) INTO v_moved FROM ins;

  RETURN COALESCE(v_moved, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_audit_logs_older_than(integer, integer) TO authenticated, service_role;

-- 3) API-style list endpoint equivalent (filter + pagination)
CREATE OR REPLACE FUNCTION public.audit_list(
  p_table_name text DEFAULT NULL,
  p_action public.audit_action DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS SETOF public.audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 500);
  v_offset integer := (v_page - 1) * v_page_size;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.audit_logs a
  WHERE (p_table_name IS NULL OR a.target_table = p_table_name OR a.table_name = p_table_name)
    AND (p_action IS NULL OR a.action = p_action)
    AND (p_user_id IS NULL OR a.actor_id = p_user_id OR a.user_id = p_user_id)
    AND (p_from IS NULL OR a.occurred_at >= p_from)
    AND (p_to IS NULL OR a.occurred_at <= p_to)
    AND (
      p_q IS NULL
      OR COALESCE(a.actor_id::text, '') ILIKE '%' || p_q || '%'
      OR COALESCE(a.user_id::text, '') ILIKE '%' || p_q || '%'
      OR COALESCE(a.action::text, '') ILIKE '%' || p_q || '%'
      OR COALESCE(a.event_type, '') ILIKE '%' || p_q || '%'
      OR COALESCE(a.target_table, a.table_name, '') ILIKE '%' || p_q || '%'
    )
  ORDER BY a.occurred_at DESC, a.id DESC
  OFFSET v_offset
  LIMIT v_page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_list(text, public.audit_action, uuid, timestamptz, timestamptz, text, integer, integer) TO authenticated, service_role;

-- 4) API-style search endpoint equivalent
CREATE OR REPLACE FUNCTION public.audit_search(
  p_q text,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.audit_logs a
  WHERE COALESCE(a.actor_id::text, '') ILIKE '%' || COALESCE(p_q, '') || '%'
     OR COALESCE(a.user_id::text, '') ILIKE '%' || COALESCE(p_q, '') || '%'
     OR COALESCE(a.action::text, '') ILIKE '%' || COALESCE(p_q, '') || '%'
     OR COALESCE(a.event_type, '') ILIKE '%' || COALESCE(p_q, '') || '%'
     OR COALESCE(a.target_table, a.table_name, '') ILIKE '%' || COALESCE(p_q, '') || '%'
  ORDER BY a.occurred_at DESC, a.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_search(text, integer) TO authenticated, service_role;

-- 5) Dashboard stats endpoint
CREATE OR REPLACE FUNCTION public.audit_stats(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  total_logs bigint,
  creates bigint,
  updates bigint,
  deletes bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint AS total_logs,
    count(*) FILTER (WHERE action = 'create')::bigint AS creates,
    count(*) FILTER (WHERE action = 'update')::bigint AS updates,
    count(*) FILTER (WHERE action = 'delete')::bigint AS deletes
  FROM public.audit_logs a
  WHERE (p_from IS NULL OR a.occurred_at >= p_from)
    AND (p_to IS NULL OR a.occurred_at <= p_to)
    AND public.has_role(auth.uid(), 'super_admin');
$$;

GRANT EXECUTE ON FUNCTION public.audit_stats(timestamptz, timestamptz) TO authenticated, service_role;

-- 6) Manual create endpoint equivalent
CREATE OR REPLACE FUNCTION public.audit_create(
  p_role text DEFAULT 'system',
  p_action public.audit_action DEFAULT 'read',
  p_module text DEFAULT 'system',
  p_table_name text DEFAULT 'system',
  p_record_id text DEFAULT NULL,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_status text DEFAULT 'success',
  p_ip_address text DEFAULT NULL,
  p_device text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  v_id := public.log_audit_event(
    'SYSTEM',
    'manual_entry',
    p_action,
    auth.uid(),
    COALESCE(p_table_name, p_module, 'system'),
    p_record_id,
    jsonb_build_object(
      'manual', true,
      'role', COALESCE(p_role, 'system'),
      'module', COALESCE(p_module, p_table_name, 'system'),
      'status', COALESCE(p_status, 'success'),
      'old_data', p_old_data,
      'new_data', p_new_data,
      'device', p_device
    ),
    p_ip_address,
    p_device,
    'manual_create',
    false,
    now()
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_create(text, public.audit_action, text, text, text, jsonb, jsonb, text, text, text) TO authenticated, service_role;

-- 7) Export endpoint equivalent (returns rows; formatting is done in app)
CREATE OR REPLACE FUNCTION public.audit_export(
  p_type text DEFAULT 'csv',
  p_table_name text DEFAULT NULL,
  p_action public.audit_action DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_q text DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS SETOF public.audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT a.*
  FROM public.audit_logs a
  WHERE (p_table_name IS NULL OR a.target_table = p_table_name OR a.table_name = p_table_name)
    AND (p_action IS NULL OR a.action = p_action)
    AND (p_user_id IS NULL OR a.actor_id = p_user_id OR a.user_id = p_user_id)
    AND (p_from IS NULL OR a.occurred_at >= p_from)
    AND (p_to IS NULL OR a.occurred_at <= p_to)
    AND (
      p_q IS NULL
      OR COALESCE(a.actor_id::text, '') ILIKE '%' || p_q || '%'
      OR COALESCE(a.action::text, '') ILIKE '%' || p_q || '%'
      OR COALESCE(a.target_table, a.table_name, '') ILIKE '%' || p_q || '%'
      OR COALESCE(a.event_type, '') ILIKE '%' || p_q || '%'
    )
  ORDER BY a.occurred_at DESC, a.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 20000);
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_export(text, text, public.audit_action, uuid, timestamptz, timestamptz, text, integer) TO authenticated, service_role;

-- 8) Expand CRUD trigger coverage to include core tracked tables (all additive)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles',
    'user_roles',
    'products',
    'orders',
    'wallets',
    'transactions',
    'license_keys',
    'servers',
    'ai_usage',
    'seo_data',
    'resellers',
    'deployments',
    'leads',
    'apks',
    'demos',
    'reseller_commission_logs'
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
