ALTER TABLE public.permission_audit ADD COLUMN IF NOT EXISTS old_enabled boolean;
ALTER TABLE public.permission_audit REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='permission_audit'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.permission_audit';
  END IF;
END $$;