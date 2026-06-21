ALTER TABLE public.retest_assignments
  ADD COLUMN IF NOT EXISTS due_time TIME,
  ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_duration_seconds INT,
  ADD COLUMN IF NOT EXISTS completed_on_time BOOLEAN;

CREATE OR REPLACE FUNCTION public.retest_compute_deadline()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.due_date IS NOT NULL THEN
    NEW.deadline_at := (NEW.due_date + COALESCE(NEW.due_time, TIME '17:00'))::timestamptz;
  ELSE
    NEW.deadline_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'Completed' AND OLD.status IS DISTINCT FROM 'Completed' THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
    NEW.completion_duration_seconds := GREATEST(0, EXTRACT(EPOCH FROM (NEW.completed_at - NEW.created_at))::int);
    IF NEW.deadline_at IS NOT NULL THEN
      NEW.completed_on_time := NEW.completed_at <= NEW.deadline_at;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS retest_compute_deadline_trg ON public.retest_assignments;
CREATE TRIGGER retest_compute_deadline_trg
BEFORE INSERT OR UPDATE ON public.retest_assignments
FOR EACH ROW EXECUTE FUNCTION public.retest_compute_deadline();

CREATE INDEX IF NOT EXISTS retest_assignments_deadline_at_idx
  ON public.retest_assignments(deadline_at)
  WHERE status <> 'Completed';