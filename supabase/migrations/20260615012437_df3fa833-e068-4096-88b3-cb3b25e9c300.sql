
REVOKE EXECUTE ON FUNCTION public.current_user_name() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_id_for_name(text) FROM PUBLIC, anon, authenticated;
