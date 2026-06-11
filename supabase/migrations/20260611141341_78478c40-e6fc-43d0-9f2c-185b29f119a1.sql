UPDATE public.retest_assignments
  SET status = CASE
    WHEN status IN ('Assigned','Cancelled') THEN 'Pending'
    WHEN status = 'Retested' THEN 'Completed'
    ELSE status
  END
  WHERE status IN ('Assigned','Cancelled','Retested');

ALTER TABLE public.retest_assignments
  ALTER COLUMN status SET DEFAULT 'Pending';