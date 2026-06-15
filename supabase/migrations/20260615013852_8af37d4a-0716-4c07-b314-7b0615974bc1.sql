-- Defect audit log: restrict SELECT
DROP POLICY IF EXISTS "audit readable to authenticated" ON public.defect_audit_log;
CREATE POLICY "audit readable to defect participants"
  ON public.defect_audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.defects d
      WHERE d.id = defect_audit_log.defect_id
        AND (
          d.created_by = public.current_user_name()
          OR d.assigned_agent = public.current_user_name()
        )
    )
  );

-- Defect comments: restrict SELECT
DROP POLICY IF EXISTS "Comments readable by authenticated" ON public.defect_comments;
CREATE POLICY "Comments readable by defect participants"
  ON public.defect_comments
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.defects d
      WHERE d.id = defect_comments.defect_id
        AND (
          d.created_by = public.current_user_name()
          OR d.assigned_agent = public.current_user_name()
        )
    )
  );

-- Forms catalog: restrict SELECT to admins and assigned agent
DROP POLICY IF EXISTS "Forms readable by authenticated" ON public.forms;
CREATE POLICY "Forms readable by assigned agent or admin"
  ON public.forms
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR assigned_agent = public.current_user_name()
  );
