
DROP POLICY IF EXISTS "Authenticated can insert activity" ON public.activity_log;

CREATE POLICY "Authenticated can insert own activity"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (actor_id IS NULL OR actor_id = auth.uid());

REVOKE EXECUTE ON FUNCTION public.log_activity(text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, text, jsonb, uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.change_user_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_name() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_id_for_name(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_scoped_id(text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_user_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_scoped_id(text, text) TO authenticated;
