-- ============================================================================
-- Permanent agent deletion: preview RPC, purge RPC, scheduled orphan sweep.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- 1) Preview: counts of all records tied to an agent NAME (admin-only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_agent_purge(_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  v_defects int; v_retests int; v_notifs int; v_forms int; v_pending int;
BEGIN
  IF caller IS NULL OR NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins can preview agent deletion';
  END IF;
  IF _name IS NULL OR length(btrim(_name)) = 0 THEN
    RAISE EXCEPTION 'Agent name is required';
  END IF;

  SELECT count(*) INTO v_defects FROM public.defects
    WHERE assigned_agent = _name OR created_by = _name OR updated_by = _name;
  SELECT count(*) INTO v_retests FROM public.retest_assignments
    WHERE assigned_agent_name = _name;
  SELECT count(*) INTO v_notifs FROM public.notifications
    WHERE title ILIKE '%' || _name || '%' OR body ILIKE '%' || _name || '%';
  SELECT count(*) INTO v_forms FROM public.forms
    WHERE assigned_agent = _name;
  SELECT count(*) INTO v_pending FROM public.retest_pending_assignments
    WHERE payload::text ILIKE '%"assigned_agent_name":"' || _name || '"%';

  RETURN jsonb_build_object(
    'name', _name,
    'defects', v_defects,
    'retest_assignments', v_retests,
    'notifications', v_notifs,
    'forms_cleared', v_forms,
    'pending_retests', v_pending,
    'total', v_defects + v_retests + v_notifs + v_forms + v_pending
  );
END $$;

REVOKE ALL ON FUNCTION public.preview_agent_purge(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_agent_purge(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Purge: deletes/clears every reference and writes audit log entries.
--    _actor_id / _actor_name allow the scheduled sweep to call as 'system'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_agent_data(
  _name text,
  _actor_id uuid DEFAULT NULL,
  _actor_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  v_actor_id uuid := COALESCE(_actor_id, caller);
  v_actor_name text := _actor_name;
  v_defects int; v_retests int; v_notifs int; v_forms int; v_pending int;
  v_total int;
  v_counts jsonb;
BEGIN
  -- Authorization: an authenticated caller must be admin. A NULL caller is
  -- only allowed when invoked by the scheduled sweep (system context).
  IF caller IS NOT NULL THEN
    IF NOT public.has_role(caller, 'admin') THEN
      RAISE EXCEPTION 'Only admins can permanently delete agent data';
    END IF;
  ELSIF _actor_name IS DISTINCT FROM 'system' THEN
    RAISE EXCEPTION 'Unauthenticated purge requires system actor';
  END IF;

  IF _name IS NULL OR length(btrim(_name)) = 0 THEN
    RAISE EXCEPTION 'Agent name is required';
  END IF;

  -- Resolve actor display name if not provided.
  IF v_actor_name IS NULL AND v_actor_id IS NOT NULL THEN
    SELECT name INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;
  END IF;
  v_actor_name := COALESCE(v_actor_name, 'system');

  WITH d AS (
    DELETE FROM public.defects
    WHERE assigned_agent = _name OR created_by = _name OR updated_by = _name
    RETURNING 1
  ) SELECT count(*) INTO v_defects FROM d;

  WITH r AS (
    DELETE FROM public.retest_assignments
    WHERE assigned_agent_name = _name
    RETURNING 1
  ) SELECT count(*) INTO v_retests FROM r;

  WITH n AS (
    DELETE FROM public.notifications
    WHERE title ILIKE '%' || _name || '%' OR body ILIKE '%' || _name || '%'
    RETURNING 1
  ) SELECT count(*) INTO v_notifs FROM n;

  WITH f AS (
    UPDATE public.forms SET assigned_agent = ''
    WHERE assigned_agent = _name
    RETURNING 1
  ) SELECT count(*) INTO v_forms FROM f;

  WITH p AS (
    DELETE FROM public.retest_pending_assignments
    WHERE payload::text ILIKE '%"assigned_agent_name":"' || _name || '"%'
    RETURNING 1
  ) SELECT count(*) INTO v_pending FROM p;

  v_total := v_defects + v_retests + v_notifs + v_forms + v_pending;
  v_counts := jsonb_build_object(
    'defects', v_defects,
    'retest_assignments', v_retests,
    'notifications', v_notifs,
    'forms_cleared', v_forms,
    'pending_retests', v_pending,
    'total_rows', v_total
  );

  -- Agent audit log: enumerated history of deletion actions.
  INSERT INTO public.agent_audit_log(
    action, target_email, target_name, target_user_id,
    performed_by_id, performed_by_name, details
  ) VALUES (
    'agent_purged', NULL, _name, NULL,
    v_actor_id, v_actor_name, v_counts
  );

  -- Cross-cutting activity log (best-effort, never breaks the txn).
  PERFORM public.log_activity(
    'user_mgmt', 'agent.purged',
    v_actor_name || ' permanently deleted agent ' || _name || ' (' || v_total || ' rows affected)',
    'user', _name, NULL, NULL, NULL, NULL, NULL,
    NULL, v_counts, 'success', NULL, NULL, NULL, v_counts,
    v_actor_id, v_actor_name, NULL
  );

  RETURN v_counts;
END $$;

REVOKE ALL ON FUNCTION public.purge_agent_data(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_agent_data(text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Scheduled sweep: purge any name referenced in defects/retests/forms
--    that doesn't match a current profile name. Runs as 'system' actor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_orphaned_agent_refs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
BEGIN
  FOR rec IN
    SELECT DISTINCT n AS name FROM (
      SELECT assigned_agent AS n FROM public.defects
        WHERE assigned_agent IS NOT NULL AND assigned_agent <> ''
      UNION SELECT created_by FROM public.defects
        WHERE created_by IS NOT NULL AND created_by <> ''
      UNION SELECT updated_by FROM public.defects
        WHERE updated_by IS NOT NULL AND updated_by <> ''
      UNION SELECT assigned_agent_name FROM public.retest_assignments
        WHERE assigned_agent_name IS NOT NULL AND assigned_agent_name <> ''
      UNION SELECT assigned_agent FROM public.forms
        WHERE assigned_agent IS NOT NULL AND assigned_agent <> ''
    ) src
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.name = src.n)
  LOOP
    v_one := public.purge_agent_data(rec.name, NULL, 'system');
    v_results := v_results || jsonb_build_object('name', rec.name, 'counts', v_one);
  END LOOP;

  RETURN jsonb_build_object('swept_at', now(), 'agents', v_results);
END $$;

REVOKE ALL ON FUNCTION public.purge_orphaned_agent_refs() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Schedule the sweep daily at 03:00 UTC. Re-schedules safely.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('purge-orphaned-agent-refs')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-orphaned-agent-refs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-orphaned-agent-refs',
  '0 3 * * *',
  $$ SELECT public.purge_orphaned_agent_refs(); $$
);