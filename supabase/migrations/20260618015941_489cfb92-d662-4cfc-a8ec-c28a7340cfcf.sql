
-- Fix activity_agent_trg to use the real column names of agent_audit_log
CREATE OR REPLACE FUNCTION public.activity_agent_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.log_activity(
    'user_mgmt', 'user.' || NEW.action,
    COALESCE(NEW.performed_by_name,'Someone') || ' performed ' || NEW.action || ' on ' || COALESCE(NEW.target_email, NEW.target_name,''),
    'user', COALESCE(NEW.target_user_id::text, NEW.target_email), NULL, NULL, NULL, NULL, NULL,
    NULL, NEW.details,
    'success', NULL, NULL, NULL, NEW.details,
    NEW.performed_by_id, NEW.performed_by_name, NULL
  );
  RETURN NEW;
END $$;

-- Fix activity_export_trg to use real export_jobs columns
CREATE OR REPLACE FUNCTION public.activity_export_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_email text;
BEGIN
  SELECT email INTO actor_email FROM public.profiles WHERE id = NEW.requested_by_id;
  PERFORM public.log_activity(
    'export', 'export.' || COALESCE(NEW.status,'requested'),
    COALESCE(NEW.requested_by_name,'Someone') || ' exported ' || COALESCE(NEW.scope,'data') || ' (' || COALESCE(NEW.environment,'—') || ')',
    'export', NEW.id::text, NULL, NULL, NULL, NULL, NEW.environment,
    NULL, jsonb_build_object('scope', NEW.scope, 'status', NEW.status, 'rows', NEW.row_count, 'file', NEW.file_name),
    CASE WHEN NEW.status = 'failed' THEN 'failure' ELSE 'success' END,
    NULL, NULL, NULL, NEW.filters,
    NEW.requested_by_id, NEW.requested_by_name, actor_email
  );
  RETURN NEW;
END $$;

-- Also fire export trigger on UPDATE (status transitions)
DROP TRIGGER IF EXISTS trg_activity_export ON public.export_jobs;
CREATE TRIGGER trg_activity_export
AFTER INSERT OR UPDATE OF status ON public.export_jobs
FOR EACH ROW EXECUTE FUNCTION public.activity_export_trg();

-- Re-run the agent backfill correctly (best-effort; dedupe by record_id + occurred_at)
DO $$ BEGIN
  INSERT INTO public.activity_log (occurred_at, actor_id, actor_name, category, action,
    record_type, record_id, summary, new_value, metadata)
  SELECT a.created_at, a.performed_by_id, a.performed_by_name, 'user_mgmt', 'user.' || a.action,
    'user', COALESCE(a.target_user_id::text, a.target_email),
    COALESCE(a.performed_by_name,'Someone') || ' ' || a.action || ' ' || COALESCE(a.target_email, a.target_name,''),
    a.details, a.details
  FROM public.agent_audit_log a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.activity_log al
    WHERE al.category='user_mgmt' AND al.occurred_at = a.created_at
      AND al.record_id = COALESCE(a.target_user_id::text, a.target_email)
  );
EXCEPTION WHEN OTHERS THEN NULL; END $$;
