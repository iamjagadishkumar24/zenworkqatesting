CREATE TABLE public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  actor_role text,
  route text,
  component text,
  message text,
  stack text,
  source text,
  last_request jsonb,
  user_agent text,
  url text,
  metadata jsonb
);

GRANT INSERT ON public.error_logs TO authenticated, anon;
GRANT SELECT, DELETE ON public.error_logs TO authenticated;
GRANT ALL ON public.error_logs TO service_role;

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert error logs"
  ON public.error_logs FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "admins can read error logs"
  ON public.error_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can delete error logs"
  ON public.error_logs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX error_logs_created_at_idx ON public.error_logs (created_at DESC);
CREATE INDEX error_logs_actor_idx ON public.error_logs (actor_id);