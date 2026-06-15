
-- 1. Defects: enforce created_by = current_user_name() on INSERT
DROP POLICY IF EXISTS "Authenticated insert defects" ON public.defects;
CREATE POLICY "Authenticated insert defects" ON public.defects
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = public.current_user_name()
    AND (updated_by = '' OR updated_by = public.current_user_name())
  );

-- 2. Defect comments: enforce author = current_user_name() AND must have access to the defect
DROP POLICY IF EXISTS "Authenticated insert comments" ON public.defect_comments;
CREATE POLICY "Authenticated insert comments" ON public.defect_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author = public.current_user_name()
    AND EXISTS (
      SELECT 1 FROM public.defects d
      WHERE d.id = defect_id
        AND (
          public.has_role(auth.uid(), 'admin'::public.app_role)
          OR d.created_by = public.current_user_name()
          OR d.assigned_agent = public.current_user_name()
        )
    )
  );

-- 3. export_jobs: add restrictive UPDATE policy (owner or admin)
DROP POLICY IF EXISTS "Update own or admin jobs" ON public.export_jobs;
CREATE POLICY "Update own or admin jobs" ON public.export_jobs
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR requested_by_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR requested_by_id = auth.uid()
  );

-- 4. profiles_safe view: recreate as SECURITY INVOKER (Postgres 15+)
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_viewdef('public.profiles_safe'::regclass, true) INTO v_def;
  EXECUTE 'DROP VIEW IF EXISTS public.profiles_safe';
  EXECUTE 'CREATE VIEW public.profiles_safe WITH (security_invoker = true) AS ' || v_def;
  EXECUTE 'GRANT SELECT ON public.profiles_safe TO authenticated';
END $$;

-- 5. Lock down SECURITY DEFINER functions from anon/public.
-- Trigger functions still run as their owner regardless of EXECUTE grants.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_comment_edit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_defect_changes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_defect_changes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_defect_comment() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_retest_changes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bump_defect_version() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.touch_retest_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;

-- 6. Remove profiles from realtime publication so email rows are not broadcast.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles';
  END IF;
END $$;
