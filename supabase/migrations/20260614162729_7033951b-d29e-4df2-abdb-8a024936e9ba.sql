
-- 1. Notifications: only self or admin can insert
DROP POLICY IF EXISTS "system inserts notifications" ON public.notifications;
CREATE POLICY "Users insert own notifications or admin"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 2. role_audit_log: only admin can insert
DROP POLICY IF EXISTS "system inserts role audit" ON public.role_audit_log;
CREATE POLICY "Admins insert role audit"
  ON public.role_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. defect_audit_log: writer must match own profile name or be admin
DROP POLICY IF EXISTS "audit insert by authenticated" ON public.defect_audit_log;
CREATE POLICY "Audit insert by self or admin"
  ON public.defect_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR changed_by = public.current_user_name()
  );

-- 4. exports bucket: enforce INSERT/UPDATE/DELETE scoped to own folder
CREATE POLICY "Users upload own exports"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'exports'
    AND (public.has_role(auth.uid(), 'admin'::app_role)
         OR (storage.foldername(name))[1] = auth.uid()::text)
  );
CREATE POLICY "Users update own exports"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'exports'
    AND (public.has_role(auth.uid(), 'admin'::app_role)
         OR (storage.foldername(name))[1] = auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'exports'
    AND (public.has_role(auth.uid(), 'admin'::app_role)
         OR (storage.foldername(name))[1] = auth.uid()::text)
  );
CREATE POLICY "Users delete own exports"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'exports'
    AND (public.has_role(auth.uid(), 'admin'::app_role)
         OR (storage.foldername(name))[1] = auth.uid()::text)
  );

-- 5. Remove role_audit_log from realtime publication (prevents broadcast leak)
ALTER PUBLICATION supabase_realtime DROP TABLE public.role_audit_log;

-- 6. Lock down SECURITY DEFINER helper functions from anon/public
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_name() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.change_user_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_id_for_name(text) FROM PUBLIC, anon;

-- 7. Pin search_path on remaining functions
ALTER FUNCTION public.bump_defect_version() SET search_path = public;
ALTER FUNCTION public.touch_retest_updated_at() SET search_path = public;
