
CREATE TABLE IF NOT EXISTS public.permission_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  target_user_id uuid,
  target_user_name text NOT NULL,
  target_role public.app_role NOT NULL,
  module text NOT NULL,
  action text NOT NULL CHECK (action IN ('view','create','edit','delete')),
  enabled boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS permission_audit_at_idx ON public.permission_audit (at DESC);

GRANT SELECT, INSERT, DELETE ON public.permission_audit TO authenticated;
GRANT ALL ON public.permission_audit TO service_role;

ALTER TABLE public.permission_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read permission audit"
  ON public.permission_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert permission audit"
  ON public.permission_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND (actor_id IS NULL OR actor_id = auth.uid())
  );

CREATE POLICY "Admins delete permission audit"
  ON public.permission_audit
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.permission_audit IS
  'Audit trail for Rights Management changes. Admin-only via RLS. Inserts are pinned to the authenticated actor.';
