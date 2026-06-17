
-- Tighten user_roles SELECT: users can read only their own role; admins can read all
DROP POLICY IF EXISTS "Roles readable by authenticated" ON public.user_roles;
CREATE POLICY "Users read own role, admins read all"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- Tighten app_settings SELECT: only the public allow_agent_exports flag is
-- readable by all authenticated users; everything else (future sensitive keys)
-- is admin-only by default.
DROP POLICY IF EXISTS "Authenticated read settings" ON public.app_settings;
CREATE POLICY "Public flags readable, others admin-only"
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (
    key IN ('allow_agent_exports')
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );
