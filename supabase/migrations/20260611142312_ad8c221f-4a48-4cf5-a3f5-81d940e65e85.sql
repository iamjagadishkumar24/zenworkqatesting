DROP POLICY IF EXISTS "Defects readable by authenticated" ON public.defects;
CREATE POLICY "Defects readable by admin or owner or assignee"
ON public.defects
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR created_by = public.current_user_name()
  OR assigned_agent = public.current_user_name()
);