
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_comment_edit() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_defect_changes() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_defect_changes() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_defect_comment() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_retest_changes() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_defect_version() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_retest_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM authenticated;
