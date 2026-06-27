REVOKE EXECUTE ON FUNCTION public.change_user_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.change_user_role(uuid, public.app_role) TO authenticated;
COMMENT ON FUNCTION public.change_user_role(uuid, public.app_role) IS 'Admin-only. Promotes/demotes a target user and writes role_audit_log. Caller must be authenticated AND pass has_role(auth.uid(), admin); enforced inside the function. Anon execute is revoked at the API layer.';

REVOKE EXECUTE ON FUNCTION public.preview_agent_purge(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.preview_agent_purge(text) TO authenticated;
COMMENT ON FUNCTION public.preview_agent_purge(text) IS 'Admin-only. Returns row counts that would be removed by purge_agent_data without mutating any data. Throws when caller lacks the admin role.';

REVOKE EXECUTE ON FUNCTION public.purge_agent_data(text, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purge_agent_data(text, uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.purge_agent_data(text, uuid, text) IS 'Admin-only (or system sweep). Destructively deletes all rows authored by or assigned to the named agent. Authenticated callers must be admin; unauthenticated calls are permitted only with actor_name=system (used by purge_orphaned_agent_refs as a scheduled job).';

REVOKE EXECUTE ON FUNCTION public.purge_orphaned_agent_refs() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purge_orphaned_agent_refs() TO service_role;
COMMENT ON FUNCTION public.purge_orphaned_agent_refs() IS 'System sweep. Intended caller: pg_cron / scheduled job running as service_role. Iterates orphaned agent names and calls purge_agent_data. Never exposed to anon or authenticated end-users.';

REVOKE EXECUTE ON FUNCTION public.next_scoped_id(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.next_scoped_id(text, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.next_scoped_id(text, text) IS 'Authenticated. Allocates the next ZEN-/TASK- id for a given tax year. Anon execute revoked: id allocation is a write-side effect.';

REVOKE EXECUTE ON FUNCTION public.current_user_name() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_user_name() TO authenticated, service_role;
COMMENT ON FUNCTION public.current_user_name() IS 'Authenticated. Returns profiles.name for auth.uid(). Used by triggers and RPC; never needs to be reachable from an anonymous session.';

REVOKE EXECUTE ON FUNCTION public.user_id_for_name(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_id_for_name(text) TO authenticated, service_role;
COMMENT ON FUNCTION public.user_id_for_name(text) IS 'Authenticated. Reverse-lookup helper used by trigger functions to map a display name to a profile id. Not exposed to anon.';

REVOKE EXECUTE ON FUNCTION public.log_activity(text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, text, jsonb, uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_activity(text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, text, jsonb, uuid, text, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.log_activity(text, text, text, text, text, text, text, text, text, text, jsonb, jsonb, text, text, text, text, jsonb, uuid, text, text) IS 'Authenticated/system. Best-effort writer for activity_log; called from every trigger function in this schema. Anon must never write activity records directly.';

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS 'Authenticated. Membership check used by RLS policies via SECURITY DEFINER to break recursion. Anon execute revoked so anonymous callers cannot probe role assignments through the Data API.';