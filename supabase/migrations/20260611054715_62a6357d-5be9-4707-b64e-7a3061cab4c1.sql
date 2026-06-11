
-- ============ ROLE AUDIT + SECURE ROLE CHANGE ============
CREATE TABLE IF NOT EXISTS public.role_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  target_name text NOT NULL DEFAULT '',
  old_role app_role,
  new_role app_role NOT NULL,
  changed_by_id uuid NOT NULL,
  changed_by_name text NOT NULL DEFAULT '',
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.role_audit_log TO authenticated;
GRANT ALL ON public.role_audit_log TO service_role;
ALTER TABLE public.role_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read role audit" ON public.role_audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "system inserts role audit" ON public.role_audit_log
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.change_user_role(_target uuid, _new_role app_role)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_name text;
  target_name text;
  old_role app_role;
  admin_count int;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins can change roles';
  END IF;
  IF _target IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  SELECT name INTO caller_name FROM public.profiles WHERE id = caller;
  SELECT name INTO target_name FROM public.profiles WHERE id = _target;

  SELECT role INTO old_role FROM public.user_roles WHERE user_id = _target LIMIT 1;

  IF old_role = _new_role THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true);
  END IF;

  -- Prevent demoting the last admin
  IF old_role = 'admin' AND _new_role <> 'admin' THEN
    SELECT count(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot demote the last remaining admin';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target;
  INSERT INTO public.user_roles(user_id, role) VALUES (_target, _new_role);

  INSERT INTO public.role_audit_log(target_user_id, target_name, old_role, new_role, changed_by_id, changed_by_name)
  VALUES (_target, COALESCE(target_name,''), old_role, _new_role, caller, COALESCE(caller_name,''));

  INSERT INTO public.notifications(user_id, type, title, body)
  VALUES (
    _target, 'role_change',
    'Your role was updated to ' || _new_role::text,
    'Changed by ' || COALESCE(caller_name,'an admin') || '. Sign out and back in for full access.'
  );

  RETURN jsonb_build_object('ok', true, 'old_role', old_role, 'new_role', _new_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_user_role(uuid, app_role) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.role_audit_log;

-- ============ RETEST ASSIGNMENTS ============
CREATE TABLE IF NOT EXISTS public.retest_assignments (
  id text PRIMARY KEY,
  environment text NOT NULL DEFAULT 'Production',
  assigned_agent_id uuid,
  assigned_agent_name text NOT NULL DEFAULT '',
  assigned_by_id uuid,
  assigned_by_name text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'Medium',
  due_date date,
  status text NOT NULL DEFAULT 'Assigned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retest_assignments TO authenticated;
GRANT ALL ON public.retest_assignments TO service_role;
ALTER TABLE public.retest_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage all retests" ON public.retest_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "agents view own retests" ON public.retest_assignments
  FOR SELECT TO authenticated
  USING (assigned_agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "agents update own retest status" ON public.retest_assignments
  FOR UPDATE TO authenticated
  USING (assigned_agent_id = auth.uid())
  WITH CHECK (assigned_agent_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.retest_assignment_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id text NOT NULL REFERENCES public.retest_assignments(id) ON DELETE CASCADE,
  form_id text NOT NULL,
  form_name text NOT NULL
);
CREATE INDEX IF NOT EXISTS retest_forms_assignment_idx ON public.retest_assignment_forms(assignment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retest_assignment_forms TO authenticated;
GRANT ALL ON public.retest_assignment_forms TO service_role;
ALTER TABLE public.retest_assignment_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage retest forms" ON public.retest_assignment_forms
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "agents view own retest forms" ON public.retest_assignment_forms
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.retest_assignments r
    WHERE r.id = assignment_id
      AND (r.assigned_agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE OR REPLACE FUNCTION public.touch_retest_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'Completed' AND (OLD.status IS DISTINCT FROM 'Completed') THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_touch_retest ON public.retest_assignments;
CREATE TRIGGER trg_touch_retest BEFORE UPDATE ON public.retest_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_retest_updated_at();

CREATE OR REPLACE FUNCTION public.notify_retest_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_agent_id IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, body, environment)
      VALUES (NEW.assigned_agent_id, 'retest_assigned',
        'Retest task assigned: ' || NEW.id,
        COALESCE(NEW.instructions,''), NEW.environment);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
      IF NEW.assigned_agent_id IS NOT NULL THEN
        INSERT INTO public.notifications(user_id, type, title, body, environment)
        VALUES (NEW.assigned_agent_id, 'retest_reassigned',
          'Retest reassigned to you: ' || NEW.id,
          'Previously: ' || COALESCE(OLD.assigned_agent_name,'—'), NEW.environment);
      END IF;
      IF OLD.assigned_agent_id IS NOT NULL AND OLD.assigned_agent_id <> NEW.assigned_agent_id THEN
        INSERT INTO public.notifications(user_id, type, title, body, environment)
        VALUES (OLD.assigned_agent_id, 'retest_unassigned',
          'Retest reassigned away: ' || NEW.id,
          'Now: ' || COALESCE(NEW.assigned_agent_name,'—'), NEW.environment);
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.assigned_by_id IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, type, title, body, environment)
      VALUES (NEW.assigned_by_id, 'retest_status',
        'Retest ' || NEW.id || ' → ' || NEW.status,
        'by ' || COALESCE(NEW.assigned_agent_name,'agent'), NEW.environment);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_retest ON public.retest_assignments;
CREATE TRIGGER trg_notify_retest
  AFTER INSERT OR UPDATE ON public.retest_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_retest_changes();

ALTER PUBLICATION supabase_realtime ADD TABLE public.retest_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.retest_assignment_forms;
