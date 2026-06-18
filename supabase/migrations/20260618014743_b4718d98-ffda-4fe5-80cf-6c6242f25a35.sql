DO $$
DECLARE
  uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE email = 'admin@qaportal.app';
  IF uid IS NULL THEN
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, email_change, email_change_token_new, recovery_token)
    VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'admin@qaportal.app', crypt('Admin@12345', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Portal Admin"}'::jsonb, '', '', '', '')
    RETURNING id INTO uid;
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email','admin@qaportal.app','email_verified',true), 'email', now(), now(), now());
  ELSE
    UPDATE auth.users
      SET encrypted_password = crypt('Admin@12345', gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          banned_until = NULL,
          updated_at = now()
      WHERE id = uid;
  END IF;

  UPDATE public.profiles SET active = true, name = COALESCE(NULLIF(name,''),'Portal Admin') WHERE id = uid;
  INSERT INTO public.profiles (id, name, email, active) VALUES (uid, 'Portal Admin', 'admin@qaportal.app', true) ON CONFLICT (id) DO NOTHING;
  DELETE FROM public.user_roles WHERE user_id = uid;
  INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'admin');
END $$;