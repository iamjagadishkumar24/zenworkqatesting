
-- =============================================================
-- 1) error_logs: remove anon insert, constrain actor identity
-- =============================================================
DROP POLICY IF EXISTS "anyone can insert error logs" ON public.error_logs;

CREATE POLICY "Authenticated insert own error logs"
  ON public.error_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id IS NULL OR actor_id = auth.uid()
  );

REVOKE INSERT ON public.error_logs FROM anon;

-- =============================================================
-- 2) profiles: prevent non-admins from changing their name
--    (closes the name-spoofing -> RLS bypass on defects/forms/comments)
-- =============================================================
CREATE OR REPLACE FUNCTION public.guard_profile_name_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.name := OLD.name;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_profile_name_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_name_change_trg ON public.profiles;
CREATE TRIGGER guard_profile_name_change_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_name_change();

-- =============================================================
-- 3) activity_log: stop actor_email / actor_name / actor_role spoofing
-- =============================================================
DROP POLICY IF EXISTS "Authenticated can insert own activity" ON public.activity_log;

CREATE POLICY "Authenticated can insert own activity"
  ON public.activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.enforce_activity_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_email text;
  v_role text;
BEGIN
  -- Allow internal SECURITY DEFINER callers (triggers / log_activity) where
  -- there is no end-user session: trust the row as built by the server.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.name, p.email INTO v_name, v_email
    FROM public.profiles p WHERE p.id = v_uid;
  SELECT role::text INTO v_role
    FROM public.user_roles WHERE user_id = v_uid LIMIT 1;

  NEW.actor_id    := v_uid;
  NEW.actor_name  := v_name;
  NEW.actor_email := v_email;
  NEW.actor_role  := v_role;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_activity_actor() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_activity_actor_trg ON public.activity_log;
CREATE TRIGGER enforce_activity_actor_trg
BEFORE INSERT ON public.activity_log
FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_actor();

-- =============================================================
-- 4) Lock down SECURITY DEFINER helpers exposed via PostgREST.
--    Keep EXECUTE only for helpers actually called from RLS or by the app.
-- =============================================================

-- Trigger-only / internal helpers: nobody should call these via the API.
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'public.activity_agent_trg()',
    'public.activity_comments_trg()',
    'public.activity_defects_trg()',
    'public.activity_export_trg()',
    'public.activity_retest_trg()',
    'public.activity_role_trg()',
    'public.bump_defect_version()',
    'public.handle_new_user()',
    'public.log_comment_edit()',
    'public.log_defect_changes()',
    'public.notify_defect_changes()',
    'public.notify_defect_comment()',
    'public.notify_retest_changes()',
    'public.retest_compute_deadline()',
    'public.touch_retest_updated_at()',
    'public.update_updated_at_column()',
    'public.user_id_for_name(text)',
    'public.purge_orphaned_agent_refs()',
    'public.log_activity(text,text,text,text,text,text,text,text,text,text,jsonb,jsonb,text,text,text,text,jsonb,uuid,text,text)'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- Admin-callable RPCs: re-affirm — only authenticated may call; helpers self-check admin.
REVOKE EXECUTE ON FUNCTION public.change_user_role(uuid, app_role)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.preview_agent_purge(text)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.purge_agent_data(text, uuid, text)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.change_user_role(uuid, app_role)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.preview_agent_purge(text)            TO authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_agent_data(text, uuid, text)   TO authenticated;

-- RPCs called by signed-in users (id allocation).
REVOKE EXECUTE ON FUNCTION public.next_scoped_id(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.next_scoped_id(text, text) TO authenticated;

-- Helpers referenced from RLS policies — must remain callable by authenticated.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_name()      FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_user_name()      TO authenticated;
