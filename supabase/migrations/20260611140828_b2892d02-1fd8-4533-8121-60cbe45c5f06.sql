ALTER TABLE public.retest_assignments
  ADD COLUMN IF NOT EXISTS testing_type text NOT NULL DEFAULT 'Retest',
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT '';