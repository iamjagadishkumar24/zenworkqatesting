
-- 1. environment column on defects + forms
ALTER TABLE public.defects
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'Production'
  CHECK (environment IN ('Production','Stage'));

ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'Production'
  CHECK (environment IN ('Production','Stage'));

-- 2. extend defect_audit_log to capture environment changes
CREATE OR REPLACE FUNCTION public.log_defect_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  IF NEW.environment IS DISTINCT FROM OLD.environment THEN
    INSERT INTO public.defect_audit_log(defect_id, field, old_value, new_value, changed_by)
    VALUES (NEW.id, 'environment', OLD.environment, NEW.environment, actor);
  END IF;
  RETURN NEW;
END;
$$;

-- 3. notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  defect_id text REFERENCES public.defects(id) ON DELETE CASCADE,
  environment text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "system inserts notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

-- 4. helper to resolve a display name -> auth user id
CREATE OR REPLACE FUNCTION public.user_id_for_name(_name text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.profiles WHERE name = _name LIMIT 1
$$;

-- 5. notification triggers on defects
CREATE OR REPLACE FUNCTION public.notify_defect_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid;
  prev_uid uuid;
  actor text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    uid := public.user_id_for_name(NEW.assigned_agent);
    IF uid IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
      VALUES (uid, 'assigned',
        'Assigned: ' || NEW.id,
        COALESCE(NEW.title,''), NEW.id, NEW.environment);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    actor := COALESCE(NEW.updated_by, 'system');
    IF NEW.assigned_agent IS DISTINCT FROM OLD.assigned_agent THEN
      uid := public.user_id_for_name(NEW.assigned_agent);
      prev_uid := public.user_id_for_name(OLD.assigned_agent);
      IF uid IS NOT NULL THEN
        INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
        VALUES (uid, 'reassigned',
          'Reassigned to you: ' || NEW.id,
          'Previous assignee: ' || COALESCE(OLD.assigned_agent,'—'), NEW.id, NEW.environment);
      END IF;
      IF prev_uid IS NOT NULL AND prev_uid <> uid THEN
        INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
        VALUES (prev_uid, 'reassigned_away',
          'Reassigned away: ' || NEW.id,
          'Now assigned to ' || COALESCE(NEW.assigned_agent,'—'), NEW.id, NEW.environment);
      END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      uid := public.user_id_for_name(NEW.assigned_agent);
      IF uid IS NOT NULL THEN
        INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
        VALUES (uid, 'status',
          NEW.id || ' status: ' || NEW.status,
          'by ' || actor, NEW.id, NEW.environment);
      END IF;
    END IF;

    IF NEW.validity IS DISTINCT FROM OLD.validity THEN
      uid := public.user_id_for_name(COALESCE(NEW.assigned_agent, NEW.created_by));
      IF uid IS NOT NULL THEN
        INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
        VALUES (uid, 'validity',
          NEW.id || ' validation: ' || NEW.validity,
          'by ' || actor, NEW.id, NEW.environment);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    uid := public.user_id_for_name(OLD.assigned_agent);
    IF uid IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
      VALUES (uid, 'deleted',
        'Defect deleted: ' || OLD.id,
        COALESCE(OLD.title,''), NULL, OLD.environment);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_defect_changes_ins ON public.defects;
DROP TRIGGER IF EXISTS trg_notify_defect_changes_upd ON public.defects;
DROP TRIGGER IF EXISTS trg_notify_defect_changes_del ON public.defects;
CREATE TRIGGER trg_notify_defect_changes_ins AFTER INSERT ON public.defects
  FOR EACH ROW EXECUTE FUNCTION public.notify_defect_changes();
CREATE TRIGGER trg_notify_defect_changes_upd AFTER UPDATE ON public.defects
  FOR EACH ROW EXECUTE FUNCTION public.notify_defect_changes();
CREATE TRIGGER trg_notify_defect_changes_del AFTER DELETE ON public.defects
  FOR EACH ROW EXECUTE FUNCTION public.notify_defect_changes();

-- 6. notification trigger on comments
CREATE OR REPLACE FUNCTION public.notify_defect_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d record;
  recipient uuid;
  author_uid uuid := public.user_id_for_name(NEW.author);
BEGIN
  SELECT id, title, assigned_agent, created_by, environment
    INTO d FROM public.defects WHERE id = NEW.defect_id;
  IF d.id IS NULL THEN RETURN NEW; END IF;

  recipient := public.user_id_for_name(d.assigned_agent);
  IF recipient IS NOT NULL AND recipient <> author_uid THEN
    INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
    VALUES (recipient, 'comment',
      'New comment on ' || d.id,
      NEW.author || ': ' || left(NEW.text, 200), d.id, d.environment);
  END IF;
  recipient := public.user_id_for_name(d.created_by);
  IF recipient IS NOT NULL AND recipient <> author_uid AND recipient <> public.user_id_for_name(d.assigned_agent) THEN
    INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
    VALUES (recipient, 'comment',
      'New comment on ' || d.id,
      NEW.author || ': ' || left(NEW.text, 200), d.id, d.environment);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_defect_comment ON public.defect_comments;
CREATE TRIGGER trg_notify_defect_comment AFTER INSERT ON public.defect_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_defect_comment();
