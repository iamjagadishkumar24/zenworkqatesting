
-- 1) ID sequence table
CREATE TABLE IF NOT EXISTS public.id_sequences (
  kind text NOT NULL,
  tax_year text NOT NULL,
  last_seq int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, tax_year)
);

GRANT SELECT ON public.id_sequences TO authenticated;
GRANT ALL ON public.id_sequences TO service_role;

ALTER TABLE public.id_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "id_sequences readable by authenticated" ON public.id_sequences;
CREATE POLICY "id_sequences readable by authenticated"
  ON public.id_sequences FOR SELECT TO authenticated USING (true);

-- 2) Atomic next-ID function
CREATE OR REPLACE FUNCTION public.next_scoped_id(_kind text, _tax_year text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
  prefix text;
  ty text := COALESCE(NULLIF(_tax_year,''), to_char(now(), 'YYYY'));
BEGIN
  IF _kind NOT IN ('defect','task') THEN
    RAISE EXCEPTION 'Unknown id kind: %', _kind;
  END IF;

  INSERT INTO public.id_sequences(kind, tax_year, last_seq)
  VALUES (_kind, ty, 1)
  ON CONFLICT (kind, tax_year)
  DO UPDATE SET last_seq = public.id_sequences.last_seq + 1,
                updated_at = now()
  RETURNING last_seq INTO n;

  prefix := CASE _kind WHEN 'defect' THEN 'ZEN' WHEN 'task' THEN 'TASK' END;
  RETURN prefix || '-' || ty || '-' || lpad(n::text, 2, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_scoped_id(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_scoped_id(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_scoped_id(text, text) TO service_role;

-- 3) Seed sequences from existing data so new IDs don't collide
INSERT INTO public.id_sequences (kind, tax_year, last_seq)
SELECT 'defect', ty, COALESCE(MAX(seq), 0)
FROM (
  SELECT split_part(id, '-', 2) AS ty,
         NULLIF(regexp_replace(split_part(id, '-', 3), '\D', '', 'g'), '')::int AS seq
  FROM public.defects
  WHERE id LIKE 'ZEN-%'
) s
WHERE ty ~ '^\d{4}$'
GROUP BY ty
ON CONFLICT (kind, tax_year) DO UPDATE
  SET last_seq = GREATEST(public.id_sequences.last_seq, EXCLUDED.last_seq);

INSERT INTO public.id_sequences (kind, tax_year, last_seq)
SELECT 'task', ty, COALESCE(MAX(seq), 0)
FROM (
  SELECT split_part(id, '-', 2) AS ty,
         NULLIF(regexp_replace(split_part(id, '-', 3), '\D', '', 'g'), '')::int AS seq
  FROM public.retest_assignments
  WHERE id LIKE 'TASK-%'
) s
WHERE ty ~ '^\d{4}$'
GROUP BY ty
ON CONFLICT (kind, tax_year) DO UPDATE
  SET last_seq = GREATEST(public.id_sequences.last_seq, EXCLUDED.last_seq);

-- 4) Notification trigger: exclude the actor (defect insert/update)
CREATE OR REPLACE FUNCTION public.notify_defect_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
  prev_uid uuid;
  actor_uid uuid;
  actor text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_uid := public.user_id_for_name(NEW.created_by);
    uid := public.user_id_for_name(NEW.assigned_agent);
    IF uid IS NOT NULL AND uid IS DISTINCT FROM actor_uid THEN
      INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
      VALUES (uid, 'assigned',
        'Assigned: ' || NEW.id,
        COALESCE(NEW.title,''), NEW.id, NEW.environment);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    actor := COALESCE(NEW.updated_by, 'system');
    actor_uid := public.user_id_for_name(actor);

    IF NEW.assigned_agent IS DISTINCT FROM OLD.assigned_agent THEN
      uid := public.user_id_for_name(NEW.assigned_agent);
      prev_uid := public.user_id_for_name(OLD.assigned_agent);
      IF uid IS NOT NULL AND uid IS DISTINCT FROM actor_uid THEN
        INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
        VALUES (uid, 'reassigned',
          'Reassigned to you: ' || NEW.id,
          'Previous assignee: ' || COALESCE(OLD.assigned_agent,'—'), NEW.id, NEW.environment);
      END IF;
      IF prev_uid IS NOT NULL AND prev_uid IS DISTINCT FROM uid AND prev_uid IS DISTINCT FROM actor_uid THEN
        INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
        VALUES (prev_uid, 'reassigned_away',
          'Reassigned away: ' || NEW.id,
          'Now assigned to ' || COALESCE(NEW.assigned_agent,'—'), NEW.id, NEW.environment);
      END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      uid := public.user_id_for_name(NEW.assigned_agent);
      IF uid IS NOT NULL AND uid IS DISTINCT FROM actor_uid THEN
        INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
        VALUES (uid, 'status',
          NEW.id || ' status: ' || NEW.status,
          'by ' || actor, NEW.id, NEW.environment);
      END IF;
    END IF;

    IF NEW.validity IS DISTINCT FROM OLD.validity THEN
      uid := public.user_id_for_name(COALESCE(NEW.assigned_agent, NEW.created_by));
      IF uid IS NOT NULL AND uid IS DISTINCT FROM actor_uid THEN
        INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
        VALUES (uid, 'validity',
          NEW.id || ' validation: ' || NEW.validity,
          'by ' || actor, NEW.id, NEW.environment);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    actor_uid := public.user_id_for_name(COALESCE(OLD.updated_by, OLD.created_by));
    uid := public.user_id_for_name(OLD.assigned_agent);
    IF uid IS NOT NULL AND uid IS DISTINCT FROM actor_uid THEN
      INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
      VALUES (uid, 'deleted',
        'Defect deleted: ' || OLD.id,
        COALESCE(OLD.title,''), NULL, OLD.environment);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- 5) Notification trigger: exclude the comment author from their own notifications
CREATE OR REPLACE FUNCTION public.notify_defect_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d record;
  recipient uuid;
  author_uid uuid := public.user_id_for_name(NEW.author);
BEGIN
  SELECT id, title, assigned_agent, created_by, environment
    INTO d FROM public.defects WHERE id = NEW.defect_id;
  IF d.id IS NULL THEN RETURN NEW; END IF;

  recipient := public.user_id_for_name(d.assigned_agent);
  IF recipient IS NOT NULL AND recipient IS DISTINCT FROM author_uid THEN
    INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
    VALUES (recipient, 'comment',
      'New comment on ' || d.id,
      NEW.author || ': ' || left(NEW.text, 200), d.id, d.environment);
  END IF;
  recipient := public.user_id_for_name(d.created_by);
  IF recipient IS NOT NULL
     AND recipient IS DISTINCT FROM author_uid
     AND recipient IS DISTINCT FROM public.user_id_for_name(d.assigned_agent) THEN
    INSERT INTO public.notifications(user_id, type, title, body, defect_id, environment)
    VALUES (recipient, 'comment',
      'New comment on ' || d.id,
      NEW.author || ': ' || left(NEW.text, 200), d.id, d.environment);
  END IF;
  RETURN NEW;
END;
$function$;

-- 6) Notification trigger: retest changes also exclude the actor
CREATE OR REPLACE FUNCTION public.notify_retest_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_agent_id IS NOT NULL
       AND NEW.assigned_agent_id IS DISTINCT FROM NEW.assigned_by_id THEN
      INSERT INTO public.notifications(user_id, type, title, body, environment)
      VALUES (NEW.assigned_agent_id, 'retest_assigned',
        'Retest task assigned: ' || NEW.id,
        COALESCE(NEW.instructions,''), NEW.environment);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_agent_id IS DISTINCT FROM OLD.assigned_agent_id THEN
      IF NEW.assigned_agent_id IS NOT NULL
         AND NEW.assigned_agent_id IS DISTINCT FROM NEW.assigned_by_id THEN
        INSERT INTO public.notifications(user_id, type, title, body, environment)
        VALUES (NEW.assigned_agent_id, 'retest_reassigned',
          'Retest reassigned to you: ' || NEW.id,
          'Previously: ' || COALESCE(OLD.assigned_agent_name,'—'), NEW.environment);
      END IF;
      IF OLD.assigned_agent_id IS NOT NULL
         AND OLD.assigned_agent_id IS DISTINCT FROM NEW.assigned_agent_id
         AND OLD.assigned_agent_id IS DISTINCT FROM NEW.assigned_by_id THEN
        INSERT INTO public.notifications(user_id, type, title, body, environment)
        VALUES (OLD.assigned_agent_id, 'retest_unassigned',
          'Retest reassigned away: ' || NEW.id,
          'Now: ' || COALESCE(NEW.assigned_agent_name,'—'), NEW.environment);
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status
          AND NEW.assigned_by_id IS NOT NULL
          AND NEW.assigned_by_id IS DISTINCT FROM NEW.assigned_agent_id THEN
      INSERT INTO public.notifications(user_id, type, title, body, environment)
      VALUES (NEW.assigned_by_id, 'retest_status',
        'Retest ' || NEW.id || ' → ' || NEW.status,
        'by ' || COALESCE(NEW.assigned_agent_name,'agent'), NEW.environment);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;
