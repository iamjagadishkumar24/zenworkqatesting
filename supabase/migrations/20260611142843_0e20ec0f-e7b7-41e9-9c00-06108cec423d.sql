
-- app_settings: portal-wide key/value toggles
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read settings" ON public.app_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write settings (insert)" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write settings (update)" ON public.app_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.app_settings(key, value) VALUES
  ('allow_agent_exports', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- export_audit_log
CREATE TABLE public.export_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text NOT NULL,
  role text NOT NULL,
  scope text NOT NULL,
  environment text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error text,
  job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.export_audit_log TO authenticated;
GRANT ALL ON public.export_audit_log TO service_role;
ALTER TABLE public.export_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or admin audit" ON public.export_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());
CREATE POLICY "Insert own audit" ON public.export_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_export_audit_created_at ON public.export_audit_log (created_at DESC);
CREATE INDEX idx_export_audit_user ON public.export_audit_log (user_id);

-- export_jobs: background export jobs
CREATE TABLE public.export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_by_name text NOT NULL,
  role text NOT NULL,
  scope text NOT NULL,
  environment text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  row_count integer NOT NULL DEFAULT 0,
  file_path text,
  file_name text,
  error text,
  retries integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT, INSERT ON public.export_jobs TO authenticated;
GRANT ALL ON public.export_jobs TO service_role;
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own or admin jobs" ON public.export_jobs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR requested_by_id = auth.uid());
CREATE POLICY "Insert own job" ON public.export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (requested_by_id = auth.uid());

CREATE INDEX idx_export_jobs_created_at ON public.export_jobs (created_at DESC);
CREATE INDEX idx_export_jobs_requested_by ON public.export_jobs (requested_by_id);

-- enable realtime
ALTER TABLE public.export_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.export_audit_log REPLICA IDENTITY FULL;
