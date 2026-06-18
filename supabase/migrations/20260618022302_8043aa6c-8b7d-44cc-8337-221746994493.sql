
CREATE OR REPLACE FUNCTION public.activity_defects_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      NEW.form_feature, NEW.tax_year, NEW.environment,
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
        'defect', NEW.id, NEW.id, NULL, NEW.form_feature, NEW.tax_year, NEW.environment,
        jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status),
        'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    END IF;
    IF NEW.assigned_agent IS DISTINCT FROM OLD.assigned_agent THEN
      PERFORM public.log_activity('defect',
        CASE WHEN OLD.assigned_agent IS NULL THEN 'defect.assigned' ELSE 'defect.reassigned' END,
        actor_nm || ' assigned ' || NEW.id || ' to ' || COALESCE(NEW.assigned_agent,'—'),
        'defect', NEW.id, NEW.id, NULL, NEW.form_feature, NEW.tax_year, NEW.environment,
        jsonb_build_object('assigned_agent', OLD.assigned_agent),
        jsonb_build_object('assigned_agent', NEW.assigned_agent),
        'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    END IF;
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      PERFORM public.log_activity('defect','defect.priority_changed',
        actor_nm || ' changed priority of ' || NEW.id || ' to ' || NEW.priority,
        'defect', NEW.id, NEW.id, NULL, NEW.form_feature, NEW.tax_year, NEW.environment,
        jsonb_build_object('priority', OLD.priority), jsonb_build_object('priority', NEW.priority),
        'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    END IF;
    IF NEW.severity IS DISTINCT FROM OLD.severity THEN
      PERFORM public.log_activity('defect','defect.severity_changed',
        actor_nm || ' changed severity of ' || NEW.id || ' to ' || NEW.severity,
        'defect', NEW.id, NEW.id, NULL, NEW.form_feature, NEW.tax_year, NEW.environment,
        jsonb_build_object('severity', OLD.severity), jsonb_build_object('severity', NEW.severity),
        'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    END IF;
    IF NEW.validity IS DISTINCT FROM OLD.validity THEN
      PERFORM public.log_activity('defect','defect.validity_changed',
        actor_nm || ' marked ' || NEW.id || ' as ' || NEW.validity,
        'defect', NEW.id, NEW.id, NULL, NEW.form_feature, NEW.tax_year, NEW.environment,
        jsonb_build_object('validity', OLD.validity), jsonb_build_object('validity', NEW.validity),
        'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    END IF;
    IF NEW.title IS DISTINCT FROM OLD.title OR NEW.environment IS DISTINCT FROM OLD.environment THEN
      PERFORM public.log_activity('defect','defect.updated',
        actor_nm || ' updated ' || NEW.id,
        'defect', NEW.id, NEW.id, NULL, NEW.form_feature, NEW.tax_year, NEW.environment,
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
      'defect', OLD.id, OLD.id, NULL, OLD.form_feature, OLD.tax_year, OLD.environment,
      to_jsonb(OLD), NULL, 'success', NULL, NULL, NULL, NULL, actor_uid, actor_nm, NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.activity_comments_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d_form text; d_year text; d_env text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT form_feature, tax_year, environment INTO d_form, d_year, d_env
      FROM public.defects WHERE id = NEW.defect_id;
    PERFORM public.log_activity('comment','comment.added',
      NEW.author || ' commented on ' || NEW.defect_id,
      'comment', NEW.id::text, NEW.defect_id, NULL, d_form, d_year, d_env,
      NULL, jsonb_build_object('text', NEW.text),
      'success', NULL, NULL, NULL, NULL,
      public.user_id_for_name(NEW.author), NEW.author, NULL);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.text IS DISTINCT FROM OLD.text THEN
    SELECT form_feature, tax_year, environment INTO d_form, d_year, d_env
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
    SELECT form_feature, tax_year, environment INTO d_form, d_year, d_env
      FROM public.defects WHERE id = OLD.defect_id;
    PERFORM public.log_activity('comment','comment.deleted',
      'Comment deleted on ' || OLD.defect_id,
      'comment', OLD.id::text, OLD.defect_id, NULL, d_form, d_year, d_env,
      jsonb_build_object('text', OLD.text), NULL,
      'success', NULL, NULL, NULL, NULL, NULL, OLD.author, NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END $function$;
