
ALTER TABLE public.defect_comments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS edited boolean NOT NULL DEFAULT false;

-- Allow authors and admins to update their own comments
DROP POLICY IF EXISTS "Authors or admins update comments" ON public.defect_comments;
CREATE POLICY "Authors or admins update comments"
  ON public.defect_comments FOR UPDATE
  TO authenticated
  USING (
    author = public.current_user_name()
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    author = public.current_user_name()
    OR public.has_role(auth.uid(), 'admin')
  );

-- Trigger: when text changes, log audit + bump updated_at/edited
CREATE OR REPLACE FUNCTION public.log_comment_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor text := COALESCE(NEW.updated_by, public.current_user_name(), 'system');
BEGIN
  IF NEW.text IS DISTINCT FROM OLD.text THEN
    NEW.updated_at := now();
    NEW.edited := true;
    NEW.updated_by := actor;
    INSERT INTO public.defect_audit_log(defect_id, field, old_value, new_value, changed_by)
    VALUES (NEW.defect_id, 'comment', OLD.text, NEW.text, actor);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_comment_edit ON public.defect_comments;
CREATE TRIGGER trg_log_comment_edit
  BEFORE UPDATE ON public.defect_comments
  FOR EACH ROW EXECUTE FUNCTION public.log_comment_edit();
