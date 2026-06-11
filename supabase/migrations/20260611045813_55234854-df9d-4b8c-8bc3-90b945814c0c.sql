DELETE FROM public.defect_comments WHERE defect_id IN ('DEF-1001','DEF-1002','DEF-1003','DEF-1004','DEF-1005','DEF-1006');
DELETE FROM public.defect_audit_log WHERE defect_id IN ('DEF-1001','DEF-1002','DEF-1003','DEF-1004','DEF-1005','DEF-1006');
DELETE FROM public.defects WHERE id IN ('DEF-1001','DEF-1002','DEF-1003','DEF-1004','DEF-1005','DEF-1006');
DELETE FROM public.notifications WHERE defect_id IN ('DEF-1001','DEF-1002','DEF-1003','DEF-1004','DEF-1005','DEF-1006');
DELETE FROM public.forms WHERE name = 'Form 1099 Corrections' OR name ILIKE '%2290%';