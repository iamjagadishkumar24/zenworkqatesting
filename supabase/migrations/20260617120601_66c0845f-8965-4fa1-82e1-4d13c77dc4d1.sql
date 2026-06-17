DROP POLICY IF EXISTS "Update own or admin jobs" ON public.export_jobs;

CREATE POLICY "Admins can update jobs"
ON public.export_jobs
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));