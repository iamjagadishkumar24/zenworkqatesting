DROP POLICY IF EXISTS "Owners delete own defects" ON public.defects;
CREATE POLICY "Owners delete own defects"
  ON public.defects
  FOR DELETE
  TO authenticated
  USING (created_by = public.current_user_name());