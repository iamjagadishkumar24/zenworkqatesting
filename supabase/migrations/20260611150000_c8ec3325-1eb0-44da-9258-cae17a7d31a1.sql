
-- 0. Generic updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- 1. agent_invites
CREATE TABLE public.agent_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','inactive')),
  notes text NOT NULL DEFAULT '',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_invites TO authenticated;
GRANT ALL ON public.agent_invites TO service_role;
ALTER TABLE public.agent_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage agent invites" ON public.agent_invites
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can see own invite by email" ON public.agent_invites
  FOR SELECT TO authenticated
  USING (email = (SELECT email FROM public.profiles WHERE id = auth.uid()));
CREATE TRIGGER agent_invites_updated_at
  BEFORE UPDATE ON public.agent_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. retest_pending_assignments
CREATE TABLE public.retest_pending_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  payload jsonb NOT NULL,
  forms jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.retest_pending_assignments TO authenticated;
GRANT ALL ON public.retest_pending_assignments TO service_role;
ALTER TABLE public.retest_pending_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage pending retests" ON public.retest_pending_assignments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. all_forms flag
ALTER TABLE public.retest_assignments
  ADD COLUMN IF NOT EXISTS all_forms boolean NOT NULL DEFAULT false;

-- 4. handle_new_user honors invites + materializes pending tasks
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_count int;
  display_name text;
  invite_row public.agent_invites%ROWTYPE;
  pending public.retest_pending_assignments%ROWTYPE;
  new_id text;
  f jsonb;
BEGIN
  display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'name',''), split_part(NEW.email,'@',1));
  INSERT INTO public.profiles (id, name, email) VALUES (NEW.id, display_name, NEW.email);

  SELECT * INTO invite_row FROM public.agent_invites WHERE email = NEW.email LIMIT 1;

  IF invite_row.id IS NOT NULL THEN
    UPDATE public.agent_invites
      SET status = CASE WHEN status = 'inactive' THEN 'inactive' ELSE 'active' END,
          user_id = NEW.id,
          name = COALESCE(NULLIF(invite_row.name,''), display_name),
          updated_at = now()
      WHERE id = invite_row.id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent') ON CONFLICT DO NOTHING;
  ELSE
    SELECT count(*) INTO user_count FROM auth.users;
    IF user_count <= 1 THEN
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
    ELSE
      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent');
    END IF;
  END IF;

  FOR pending IN SELECT * FROM public.retest_pending_assignments WHERE email = NEW.email LOOP
    new_id := 'RT-' || floor(extract(epoch FROM now()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4);
    INSERT INTO public.retest_assignments (
      id, environment, assigned_agent_id, assigned_agent_name,
      assigned_by_id, assigned_by_name,
      instructions, priority, due_date, status,
      testing_type, title, module, all_forms
    ) VALUES (
      new_id,
      COALESCE(pending.payload->>'environment','Production'),
      NEW.id,
      display_name,
      pending.created_by_id,
      pending.created_by_name,
      COALESCE(pending.payload->>'instructions',''),
      COALESCE(pending.payload->>'priority','Medium'),
      NULLIF(pending.payload->>'due_date','')::date,
      'Pending',
      COALESCE(pending.payload->>'testing_type','Retest'),
      COALESCE(pending.payload->>'title',''),
      COALESCE(pending.payload->>'module',''),
      COALESCE((pending.payload->>'all_forms')::boolean, false)
    );
    IF jsonb_array_length(pending.forms) > 0 THEN
      FOR f IN SELECT * FROM jsonb_array_elements(pending.forms) LOOP
        INSERT INTO public.retest_assignment_forms (assignment_id, form_id, form_name)
          VALUES (new_id, f->>'id', f->>'name');
      END LOOP;
    END IF;
  END LOOP;
  DELETE FROM public.retest_pending_assignments WHERE email = NEW.email;

  RETURN NEW;
END;
$$;
