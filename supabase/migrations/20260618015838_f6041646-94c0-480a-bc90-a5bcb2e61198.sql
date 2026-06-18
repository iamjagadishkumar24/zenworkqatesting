
-- =====================================================================
-- Unified activity_log — append-only audit stream
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_name text,
  actor_email text,
  actor_role text,
  category text NOT NULL,
  action text NOT NULL,
  record_type text,
  record_id text,
  defect_id text,
  task_id text,
  form_name text,
  tax_year text,
  environment text,
  summary text,
  old_value jsonb,
  new_value jsonb,
  result text NOT NULL DEFAULT 'success',
  ip_address text,
  user_agent text,
  session_id text,
  metadata jsonb
);

GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Admins can read everything; no one can update or delete.
CREATE POLICY "Admins can view all activity"
  ON public.activity_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow authenticated inserts (server fns / triggers); RLS still locks reads.
CREATE POLICY "Authenticated can insert activity"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_activity_log_occurred_at ON public.activity_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_category ON public.activity_log (category, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON public.activity_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_defect ON public.activity_log (defect_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_task ON public.activity_log (task_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON public.activity_log (action);

ALTER TABLE public.activity_log REPLICA IDENTITY FULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'activity_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log';
  END IF;
END $$;

-- =====================================================================
-- Helper: log_activity (callable by SQL & server fns)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.log_activity(
  _category text,
  _action text,
  _summary text DEFAULT NULL,
  _record_type text DEFAULT NULL,
  _record_id text DEFAULT NULL,
  _defect_id text DEFAULT NULL,
  _task_id text DEFAULT NULL,
  _form_name text DEFAULT NULL,
  _tax_year text DEFAULT NULL,
  _environment text DEFAULT NULL,
  _old_value jsonb DEFAULT NULL,
  _new_value jsonb DEFAULT NULL,
  _result text DEFAULT 'success',
  _ip text DEFAULT NULL,
  _ua text DEFAULT NULL,
  _session_id text DEFAULT NULL,
  _metadata jsonb DEFAULT NULL,
  _actor_id uuid DEFAULT NULL,
  _actor_name text DEFAULT NULL,
  _actor_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_actor uuid := COALESCE(_actor_id, auth.uid());
  v_name text := _actor_name;
  v_email text := _actor_email;
  v_role text;
BEGIN
  IF v_actor IS NOT NULL AND (v_name IS NULL OR v_email IS NULL) THEN
    SELECT COALESCE(v_name, p.name), COALESCE(v_email, p.email)
      INTO v_name, v_email
      FROM public.profiles p WHERE p.id = v_actor;
  END IF;
  IF v_actor IS NOT NULL THEN
    SELECT role::text INTO v_role FROM public.user_roles WHERE user_id = v_actor LIMIT 1;
  END IF;

  INSERT INTO public.activity_log (
    actor_id, actor_name, actor_email, actor_role,
    category, action, record_type, record_id,
    defect_id, task_id, form_name, tax_year, environment,
    summary, old_value, new_value, result,
    ip_address, user_agent, session_id, metadata
  ) VALUES (
    v_actor, v_name, v_email, v_role,
    _category, _action, _record_type, _record_id,
    _defect_id, _task_id, _form_name, _tax_year, _environment,
    _summary, _old_value, _new_value, COALESCE(_result, 'success'),
    _ip, _ua, _session_id, _metadata
  ) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- never break the originating txn
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_activity(
  text, text, text, text, text, text, text, text, text, text,
  jsonb, jsonb, text, text, text, text, jsonb, uuid, text, text
) TO authenticated, service_role;

-- =====================================================================
-- Triggers: defects
-- =====================================================================

CREATE OR REPLACE FUNCTION public.activity_defects_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  actor_uid uuid;
  actor_nm text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_nm := COALESCE(NEW.created_by, NEW.updated_by);
    actor_uid := public.user_id_for_name(actor_nm);
    PERFORM public.log_activity(
      'defect','defect.created',
      COALESCE(actor_nm,'Someone') || ' created defect ' || NEW.id,
      'defect', NEW.id, NEW.id, NULL,
      NEW.form_name, NEW.tax_year, NEW.environment,
      NULL, to_jsonb(NEW), 'success', NULL, NULL, NULL,
      jsonb_build_object('status', NEW.status, 'priority', NEW.priority, 'severity', NEW.severity),
      actor_uid, actor_nm, NULL
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    actor_nm := COALESCE(NEW.updated_by, NEW.created_by);
    actor_uid := public.user_id_for_name(actor_nm);
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.log_activity('defect',
        CASE
          WHEN NEW.status IN ('Closed') THEN 'defect.closed'
          WHEN OLD.status IN ('Closed','Fixed') AND NEW.status IN ('Reported','Open','In Progress') THEN 'defect.reopened'
          ELSE 'defect.status_changed'
        END,
        actor_nm || ' changed status of ' || NEW.id || ' from ' || OLD.status || ' to ' || NEW.status,
        'defect', NEW.id, NEW.id, NULL, NEW.form_name, NEW.tax_year, NEW.environment,
        jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status),
        'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    END IF;
    IF NEW.assigned_agent IS DISTINCT FROM OLD.assigned_agent THEN
      PERFORM public.log_activity('defect',
        CASE WHEN OLD.assigned_agent IS NULL THEN 'defect.assigned' ELSE 'defect.reassigned' END,
        actor_nm || ' assigned ' || NEW.id || ' to ' || COALESCE(NEW.assigned_agent,'—'),
        'defect', NEW.id, NEW.id, NULL, NEW.form_name, NEW.tax_year, NEW.environment,
        jsonb_build_object('assigned_agent', OLD.assigned_agent),
        jsonb_build_object('assigned_agent', NEW.assigned_agent),
        'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    END IF;
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      PERFORM public.log_activity('defect','defect.priority_changed',
        actor_nm || ' changed priority of ' || NEW.id || ' to ' || NEW.priority,
        'defect', NEW.id, NEW.id, NULL, NEW.form_name, NEW.tax_year, NEW.environment,
        jsonb_build_object('priority', OLD.priority), jsonb_build_object('priority', NEW.priority),
        'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    END IF;
    IF NEW.severity IS DISTINCT FROM OLD.severity THEN
      PERFORM public.log_activity('defect','defect.severity_changed',
        actor_nm || ' changed severity of ' || NEW.id || ' to ' || NEW.severity,
        'defect', NEW.id, NEW.id, NULL, NEW.form_name, NEW.tax_year, NEW.environment,
        jsonb_build_object('severity', OLD.severity), jsonb_build_object('severity', NEW.severity),
        'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    END IF;
    IF NEW.validity IS DISTINCT FROM OLD.validity THEN
      PERFORM public.log_activity('defect','defect.validity_changed',
        actor_nm || ' marked ' || NEW.id || ' as ' || NEW.validity,
        'defect', NEW.id, NEW.id, NULL, NEW.form_name, NEW.tax_year, NEW.environment,
        jsonb_build_object('validity', OLD.validity), jsonb_build_object('validity', NEW.validity),
        'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title OR NEW.environment IS DISTINCT FROM OLD.environment THEN
      PERFORM public.log_activity('defect','defect.updated',
        actor_nm || ' updated ' || NEW.id,
        'defect', NEW.id, NEW.id, NULL, NEW.form_name, NEW.tax_year, NEW.environment,
        jsonb_build_object('title', OLD.title, 'environment', OLD.environment),
        jsonb_build_object('title', NEW.title, 'environment', NEW.environment),
        'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    actor_nm := COALESCE(OLD.updated_by, OLD.created_by);
    actor_uid := public.user_id_for_name(actor_nm);
    PERFORM public.log_activity('defect','defect.deleted',
      COALESCE(actor_nm,'Someone') || ' deleted defect ' || OLD.id,
      'defect', OLD.id, OLD.id, NULL, OLD.form_name, OLD.tax_year, OLD.environment,
      to_jsonb(OLD), NULL, 'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_activity_defects ON public.defects;
CREATE TRIGGER trg_activity_defects
AFTER INSERT OR UPDATE OR DELETE ON public.defects
FOR EACH ROW EXECUTE FUNCTION public.activity_defects_trg();

-- =====================================================================
-- Triggers: defect_comments
-- =====================================================================

CREATE OR REPLACE FUNCTION public.activity_comments_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  d_form text; d_year text; d_env text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT form_name, tax_year, environment INTO d_form, d_year, d_env
      FROM public.defects WHERE id = NEW.defect_id;
    PERFORM public.log_activity('comment','comment.added',
      NEW.author || ' commented on ' || NEW.defect_id,
      'comment', NEW.id::text, NEW.defect_id, NULL, d_form, d_year, d_env,
      NULL, jsonb_build_object('text', NEW.text),
      'success', NULL, NULL, NULL, NULL,
      public.user_id_for_name(NEW.author), NEW.author, NULL);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.text IS DISTINCT FROM OLD.text THEN
    SELECT form_name, tax_year, environment INTO d_form, d_year, d_env
      FROM public.defects WHERE id = NEW.defect_id;
    PERFORM public.log_activity('comment','comment.edited',
      COALESCE(NEW.updated_by, NEW.author) || ' edited a comment on ' || NEW.defect_id,
      'comment', NEW.id::text, NEW.defect_id, NULL, d_form, d_year, d_env,
      jsonb_build_object('text', OLD.text), jsonb_build_object('text', NEW.text),
      'success', NULL, NULL, NULL, NULL,
      public.user_id_for_name(COALESCE(NEW.updated_by, NEW.author)),
      COALESCE(NEW.updated_by, NEW.author), NULL);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT form_name, tax_year, environment INTO d_form, d_year, d_env
      FROM public.defects WHERE id = OLD.defect_id;
    PERFORM public.log_activity('comment','comment.deleted',
      'Comment deleted on ' || OLD.defect_id,
      'comment', OLD.id::text, OLD.defect_id, NULL, d_form, d_year, d_env,
      jsonb_build_object('text', OLD.text), NULL,
      'success', NULL, NULL, NULL, NULL, NULL, OLD.author, NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_activity_comments ON public.defect_comments;
CREATE TRIGGER trg_activity_comments
AFTER INSERT OR UPDATE OR DELETE ON public.defect_comments
FOR EACH ROW EXECUTE FUNCTION public.activity_comments_trg();

-- =====================================================================
-- Triggers: retest_assignments (tasks)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.activity_retest_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_activity('task','task.created',
      COALESCE(NEW.assigned_by_name,'Someone') || ' created task ' || NEW.id,
      'task', NEW.id, NULL, NEW.id, NULL, NEW.tax_year, NEW.environment,
      NULL, to_jsonb(NEW), 'success', NULL, NULL, NULL,
      jsonb_build_object('assigned_to', NEW.assigned_agent_name, 'status', NEW.status),
      NEW.assigned_by_id, NEW.assigned_by_name, NULL);
    IF NEW.assigned_agent_id IS NOT NULL THEN
      PERFORM public.log_activity('task','task.assigned',
        COALESCE(NEW.assigned_by_name,'Someone') || ' assigned task ' || NEW.id || ' to ' || COALESCE(NEW.assigned_agent_name,'—'),
        'task', NEW.id, NULL, NEW.id, NULL, NEW.tax_year, NEW.environment,
        NULL, jsonb_build_object('assigned_to', NEW.assigned_agent_name),
        'success', NULL, NULL, NULL, NULL,
        NEW.assigned_by_id, NEW.assigned_by_name, NULL);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
      PERFORM public.log_activity('task','task.reassigned',
        'Task ' || NEW.id || ' reassigned to ' || COALESCE(NEW.assigned_agent_name,'—'),
        'task', NEW.id, NULL, NEW.id, NULL, NEW.tax_year, NEW.environment,
        jsonb_build_object('assigned_to', OLD.assigned_agent_name),
        jsonb_build_object('assigned_to', NEW.assigned_agent_name),
        'success', NULL, NULL, NULL, NULL,
        NEW.assigned_by_id, NEW.assigned_by_name, NULL);
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public.log_activity('task',
        CASE NEW.status
          WHEN 'Completed' THEN 'task.completed'
          WHEN 'Pending' THEN 'task.reopened'
          ELSE 'task.status_changed'
        END,
        'Task ' || NEW.id || ' → ' || NEW.status,
        'task', NEW.id, NULL, NEW.id, NULL, NEW.tax_year, NEW.environment,
        jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status),
        'success', NULL, NULL, NULL, NULL,
        NEW.assigned_agent_id, NEW.assigned_agent_name, NULL);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_activity('task','task.deleted',
      'Task ' || OLD.id || ' deleted',
      'task', OLD.id, NULL, OLD.id, NULL, OLD.tax_year, OLD.environment,
      to_jsonb(OLD), NULL, 'success', NULL, NULL, NULL, NULL,
      OLD.assigned_by_id, OLD.assigned_by_name, NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_activity_retest ON public.retest_assignments;
CREATE TRIGGER trg_activity_retest
AFTER INSERT OR UPDATE OR DELETE ON public.retest_assignments
FOR EACH ROW EXECUTE FUNCTION public.activity_retest_trg();

-- =====================================================================
-- Triggers: role_audit_log → activity
-- =====================================================================

CREATE OR REPLACE FUNCTION public.activity_role_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.log_activity('role','role.changed',
    NEW.changed_by_name || ' changed role of ' || NEW.target_name || ' from ' || COALESCE(NEW.old_role::text,'—') || ' to ' || NEW.new_role::text,
    'user', NEW.target_user_id::text, NULL, NULL, NULL, NULL, NULL,
    jsonb_build_object('role', NEW.old_role), jsonb_build_object('role', NEW.new_role),
    'success', NULL, NULL, NULL, NULL,
    NEW.changed_by_id, NEW.changed_by_name, NULL);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_activity_role ON public.role_audit_log;
CREATE TRIGGER trg_activity_role
AFTER INSERT ON public.role_audit_log
FOR EACH ROW EXECUTE FUNCTION public.activity_role_trg();

-- =====================================================================
-- Triggers: agent_audit_log → activity (user_mgmt)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.activity_agent_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.log_activity('user_mgmt','user.' || NEW.action,
    COALESCE(NEW.actor_name,'Someone') || ' performed ' || NEW.action || ' on ' || COALESCE(NEW.target_email, NEW.target_name,''),
    'user', COALESCE(NEW.target_user_id::text, NEW.target_email), NULL, NULL, NULL, NULL, NULL,
    NEW.before_value, NEW.after_value,
    'success', NULL, NULL, NULL, NULL,
    NEW.actor_id, NEW.actor_name, NULL);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_activity_agent ON public.agent_audit_log;
CREATE TRIGGER trg_activity_agent
AFTER INSERT ON public.agent_audit_log
FOR EACH ROW EXECUTE FUNCTION public.activity_agent_trg();

-- =====================================================================
-- Triggers: export_jobs → activity
-- =====================================================================

CREATE OR REPLACE FUNCTION public.activity_export_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_name text; actor_email text;
BEGIN
  SELECT p.name, p.email INTO actor_name, actor_email
    FROM public.profiles p WHERE p.id = NEW.created_by;
  PERFORM public.log_activity('export','export.run',
    COALESCE(actor_name,'Someone') || ' exported ' || COALESCE(NEW.kind,'data'),
    'export', NEW.id::text, NULL, NULL, NULL, NULL, NULL,
    NULL, to_jsonb(NEW), 'success', NULL, NULL, NULL,
    jsonb_build_object('kind', NEW.kind, 'format', NEW.format),
    NEW.created_by, actor_name, actor_email);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_activity_export ON public.export_jobs;
CREATE TRIGGER trg_activity_export
AFTER INSERT ON public.export_jobs
FOR EACH ROW EXECUTE FUNCTION public.activity_export_trg();

-- =====================================================================
-- Backfill historical entries (best-effort; ignore on schema diff)
-- =====================================================================

DO $$ BEGIN
  INSERT INTO public.activity_log (occurred_at, actor_name, category, action,
    record_type, record_id, defect_id, summary, old_value, new_value)
  SELECT changed_at, changed_by, 'defect', 'defect.' || field || '_changed',
    'defect', defect_id, defect_id,
    changed_by || ' changed ' || field || ' on ' || defect_id,
    jsonb_build_object(field, old_value), jsonb_build_object(field, new_value)
  FROM public.defect_audit_log
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  INSERT INTO public.activity_log (occurred_at, actor_id, actor_name, category, action,
    record_type, record_id, summary, old_value, new_value)
  SELECT created_at, actor_id, actor_name, 'user_mgmt', 'user.' || action,
    'user', COALESCE(target_user_id::text, target_email),
    COALESCE(actor_name,'Someone') || ' ' || action || ' ' || COALESCE(target_email, target_name,''),
    before_value, after_value
  FROM public.agent_audit_log
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  INSERT INTO public.activity_log (occurred_at, actor_id, actor_name, category, action,
    record_type, record_id, summary, old_value, new_value)
  SELECT created_at, changed_by_id, changed_by_name, 'role', 'role.changed',
    'user', target_user_id::text,
    changed_by_name || ' changed role of ' || target_name,
    jsonb_build_object('role', old_role), jsonb_build_object('role', new_role)
  FROM public.role_audit_log
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
