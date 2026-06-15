
CREATE TABLE IF NOT EXISTS public.email_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  template text NOT NULL,
  provider text NOT NULL DEFAULT 'none',
  status text NOT NULL DEFAULT 'queued',
  error text,
  related_task_id text,
  related_defect_id text,
  triggered_by_id uuid,
  triggered_by_name text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

GRANT SELECT ON public.email_log TO authenticated;
GRANT ALL ON public.email_log TO service_role;

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view email log"
  ON public.email_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Flip default: allow agents to export their own reported errors out of the box.
INSERT INTO public.app_settings (key, value)
VALUES ('allow_agent_exports', 'true'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb, updated_at = now();
