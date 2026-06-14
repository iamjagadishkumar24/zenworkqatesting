-- Restrict profiles email exposure: only self + admins can SELECT the full row.
-- A safe view exposes non-sensitive columns (id, name, avatar_url, active) to all authenticated users for pickers/lists.

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;

CREATE POLICY "Profiles self select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can select all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Safe public view: no email. Runs with view owner privileges (security_invoker off by default),
-- so it bypasses RLS on the base table but only exposes non-sensitive columns.
CREATE OR REPLACE VIEW public.profiles_safe AS
  SELECT id, name, avatar_url, active
  FROM public.profiles;

REVOKE ALL ON public.profiles_safe FROM PUBLIC, anon;
GRANT SELECT ON public.profiles_safe TO authenticated;