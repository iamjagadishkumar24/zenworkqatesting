
-- Extra link fields + validity marker
ALTER TABLE public.defects
  ADD COLUMN IF NOT EXISTS evidence_url text,
  ADD COLUMN IF NOT EXISTS screenshot_url text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS excel_url text,
  ADD COLUMN IF NOT EXISTS drive_url text,
  ADD COLUMN IF NOT EXISTS attachment_url2 text,
  ADD COLUMN IF NOT EXISTS validity text NOT NULL DEFAULT 'Unverified';

-- Audit log table
CREATE TABLE IF NOT EXISTS public.defect_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defect_id text NOT NULL REFERENCES public.defects(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.defect_audit_log TO authenticated;
GRANT ALL ON public.defect_audit_log TO service_role;

ALTER TABLE public.defect_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit readable to authenticated"
  ON public.defect_audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "audit insert by authenticated"
  ON public.defect_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger: write audit entries when defect fields change
CREATE OR REPLACE FUNCTION public.log_defect_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor text := COALESCE(NEW.updated_by, 'system');
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.defect_audit_log(defect_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'status', OLD.status, NEW.status, actor);
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.defect_audit_log(defect_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'priority', OLD.priority, NEW.priority, actor);
  END IF;
  IF NEW.severity IS DISTINCT FROM OLD.severity THEN
    INSERT INTO public.defect_audit_log(defect_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'severity', OLD.severity, NEW.severity, actor);
  END IF;
  IF NEW.assigned_agent IS DISTINCT FROM OLD.assigned_agent THEN
    INSERT INTO public.defect_audit_log(defect_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'assigned_agent', OLD.assigned_agent, NEW.assigned_agent, actor);
  END IF;
  IF NEW.validity IS DISTINCT FROM OLD.validity THEN
    INSERT INTO public.defect_audit_log(defect_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'validity', OLD.validity, NEW.validity, actor);
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.defect_audit_log(defect_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'title', OLD.title, NEW.title, actor);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_defect_changes ON public.defects;
CREATE TRIGGER trg_log_defect_changes
  AFTER UPDATE ON public.defects
  FOR EACH ROW
  EXECUTE FUNCTION public.log_defect_changes();

-- Add audit log to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.defect_audit_log;
