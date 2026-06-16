
-- Agent administrative audit log: records every admin action that affects
-- agent access (invite, resend invite, deactivate, reactivate, delete).
CREATE TABLE IF NOT EXISTS public.agent_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL CHECK (action IN ('invite_created','invite_resent','invite_removed','agent_deactivated','agent_reactivated','agent_deleted')),
  target_user_id uuid,
  target_email text NOT NULL,
  target_name text,
  performed_by_id uuid,
  performed_by_name text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.agent_audit_log TO authenticated;
GRANT ALL ON public.agent_audit_log TO service_role;

ALTER TABLE public.agent_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read agent audit"
  ON public.agent_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert agent audit"
  ON public.agent_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_agent_audit_created_at ON public.agent_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_target_email ON public.agent_audit_log (target_email);
