CREATE TABLE IF NOT EXISTS public.qa_runtime_config (
  id text PRIMARY KEY DEFAULT 'default',
  live_enabled boolean NOT NULL DEFAULT true,
  performance_mode boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL,
  CONSTRAINT qa_runtime_config_singleton CHECK (id = 'default')
);
GRANT SELECT ON public.qa_runtime_config TO anon, authenticated;
GRANT ALL ON public.qa_runtime_config TO service_role;
ALTER TABLE public.qa_runtime_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read runtime config" ON public.qa_runtime_config FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.qa_runtime_config (id, live_enabled, performance_mode) VALUES ('default', true, false) ON CONFLICT (id) DO NOTHING;