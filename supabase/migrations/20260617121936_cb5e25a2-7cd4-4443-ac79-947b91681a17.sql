GRANT EXECUTE ON FUNCTION public.current_user_name() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_id_for_name(text) TO authenticated, anon;