CREATE TABLE IF NOT EXISTS public.qa_runtime_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_live_enabled boolean,
  new_live_enabled boolean NOT NULL,
  old_performance_mode boolean,
  new_performance_mode boolean NOT NULL,
  changed_by_id uuid,
  changed_by_name text,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qa_runtime_config_audit TO authenticated;
GRANT ALL ON public.qa_runtime_config_audit TO service_role;
ALTER TABLE public.qa_runtime_config_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view runtime config audit"
  ON public.qa_runtime_config_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS qa_runtime_config_audit_created_at_idx
  ON public.qa_runtime_config_audit (created_at DESC);