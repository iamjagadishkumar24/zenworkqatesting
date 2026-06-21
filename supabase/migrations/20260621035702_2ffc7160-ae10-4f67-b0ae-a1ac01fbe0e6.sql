-- Purge orphaned references to former agent "Jack".
-- Jack has no profile / auth user / invite / role; the name only persists as
-- stale strings on defects, retest_assignments, forms, and notifications.

-- 1. Defects authored by or assigned to Jack (cascades comments + audit log via FKs).
DELETE FROM public.defects
WHERE assigned_agent = 'Jack'
   OR created_by = 'Jack'
   OR updated_by = 'Jack';

-- 2. Retest assignments referencing Jack (cascades retest_assignment_forms).
DELETE FROM public.retest_assignments
WHERE assigned_agent_name = 'Jack';

-- 3. Notifications generated for those retests.
DELETE FROM public.notifications
WHERE title ILIKE '%Jack%' OR body ILIKE '%Jack%';

-- 4. Clear Jack from forms (leave the form, just blank the stale assignee).
UPDATE public.forms
SET assigned_agent = ''
WHERE assigned_agent = 'Jack';

-- 5. Any pending retest payloads referencing Jack (defensive; currently none).
DELETE FROM public.retest_pending_assignments
WHERE payload::text ILIKE '%"assigned_agent_name":"Jack"%'
   OR forms::text ILIKE '%"Jack"%';