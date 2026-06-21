
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_text text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'yellow' CHECK (color IN ('yellow','blue','green','red','purple','grey')),
  tags text[] NOT NULL DEFAULT '{}',
  is_pinned boolean NOT NULL DEFAULT false,
  is_favorite boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes" ON public.notes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notes" ON public.notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notes" ON public.notes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own notes" ON public.notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX notes_user_updated_idx ON public.notes (user_id, is_archived, is_pinned, updated_at DESC);
CREATE INDEX notes_tags_idx ON public.notes USING GIN (tags);

CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
