
CREATE TABLE public.report_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_views TO authenticated;
GRANT ALL ON public.report_views TO service_role;

ALTER TABLE public.report_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own report views"
  ON public.report_views FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own report views"
  ON public.report_views FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own report views"
  ON public.report_views FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own report views"
  ON public.report_views FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_report_views_updated_at
  BEFORE UPDATE ON public.report_views
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
