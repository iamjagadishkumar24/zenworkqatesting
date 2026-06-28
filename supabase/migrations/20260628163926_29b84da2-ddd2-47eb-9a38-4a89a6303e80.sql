
-- 1. Action enum
DO $$ BEGIN
  CREATE TYPE public.permission_action AS ENUM ('view','create','edit','delete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Per-user override table
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  action public.permission_action NOT NULL,
  enabled boolean NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module, action)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own perms" ON public.user_permissions;
CREATE POLICY "users read own perms"
  ON public.user_permissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage perms" ON public.user_permissions;
CREATE POLICY "admins manage perms"
  ON public.user_permissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_user_permissions_updated_at ON public.user_permissions;
CREATE TRIGGER trg_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime stream
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_permissions;

-- 3. Role default for a (role, action) pair
CREATE OR REPLACE FUNCTION public.role_default_permission(
  _role app_role,
  _action public.permission_action
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _action = 'view' THEN true
    WHEN _role = 'admin' THEN true
    ELSE false
  END
$$;

-- 4. Effective permission: override wins, else role default
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id uuid,
  _module text,
  _action public.permission_action
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override boolean;
  v_role app_role;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  SELECT enabled INTO v_override
    FROM public.user_permissions
    WHERE user_id = _user_id AND module = _module AND action = _action;
  IF FOUND THEN RETURN v_override; END IF;

  SELECT role INTO v_role
    FROM public.user_roles WHERE user_id = _user_id LIMIT 1;
  IF v_role IS NULL THEN RETURN false; END IF;

  RETURN public.role_default_permission(v_role, _action);
END;
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text, public.permission_action) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, public.permission_action) TO authenticated, service_role;

-- 5. Bulk list overrides for one user (admin or self)
CREATE OR REPLACE FUNCTION public.list_user_permission_overrides(_user_id uuid)
RETURNS TABLE(module text, action public.permission_action, enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
    SELECT up.module, up.action, up.enabled
      FROM public.user_permissions up
      WHERE up.user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_user_permission_overrides(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_user_permission_overrides(uuid) TO authenticated, service_role;

-- 6. Upsert (admin only) — used by Rights Management server fn
CREATE OR REPLACE FUNCTION public.set_user_permission(
  _target_user_id uuid,
  _module text,
  _action public.permission_action,
  _enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller IS NULL OR NOT public.has_role(caller, 'admin') THEN
    RAISE EXCEPTION 'Only admins can change permissions';
  END IF;
  IF _target_user_id IS NULL OR _module IS NULL OR length(btrim(_module)) = 0 THEN
    RAISE EXCEPTION 'Invalid target or module';
  END IF;

  INSERT INTO public.user_permissions(user_id, module, action, enabled, updated_by)
  VALUES (_target_user_id, _module, _action, _enabled, caller)
  ON CONFLICT (user_id, module, action)
  DO UPDATE SET enabled = EXCLUDED.enabled,
                updated_by = EXCLUDED.updated_by,
                updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_permission(uuid, text, public.permission_action, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_permission(uuid, text, public.permission_action, boolean) TO authenticated, service_role;
