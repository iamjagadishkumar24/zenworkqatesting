
CREATE POLICY "Read own exports" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'exports' AND (
      public.has_role(auth.uid(), 'admin')
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );
