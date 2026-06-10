
-- =========================================
-- Enums
-- =========================================
CREATE TYPE public.app_role AS ENUM ('admin', 'agent');

-- =========================================
-- Profiles
-- =========================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles readable by authenticated"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- =========================================
-- User Roles
-- =========================================
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.current_user_name()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT name FROM public.profiles WHERE id = auth.uid()
$$;

CREATE POLICY "Roles readable by authenticated"
  ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- Auto-create profile + role on signup
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count int;
  display_name text;
BEGIN
  display_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    split_part(NEW.email, '@', 1)
  );
  INSERT INTO public.profiles (id, name, email)
    VALUES (NEW.id, display_name, NEW.email);

  SELECT count(*) INTO user_count FROM auth.users;
  IF user_count <= 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- Forms catalog
-- =========================================
CREATE TABLE public.forms (
  id text PRIMARY KEY,
  name text NOT NULL,
  module text NOT NULL,
  status text NOT NULL DEFAULT 'Pending',
  passed int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  open_defects int NOT NULL DEFAULT 0,
  last_tested timestamptz NOT NULL DEFAULT now(),
  assigned_agent text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms TO authenticated;
GRANT ALL ON public.forms TO service_role;
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Forms readable by authenticated"
  ON public.forms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage forms"
  ON public.forms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Agents update assigned forms"
  ON public.forms FOR UPDATE TO authenticated
  USING (assigned_agent = public.current_user_name())
  WITH CHECK (assigned_agent = public.current_user_name());

-- =========================================
-- Defects (with optimistic lock version)
-- =========================================
CREATE TABLE public.defects (
  id text PRIMARY KEY,
  module text NOT NULL,
  form_feature text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  steps_to_reproduce text NOT NULL DEFAULT '',
  expected_result text NOT NULL DEFAULT '',
  actual_result text NOT NULL DEFAULT '',
  attachment_url text,
  jira_url text,
  status text NOT NULL DEFAULT 'Reported',
  priority text NOT NULL DEFAULT 'Medium',
  severity text NOT NULL DEFAULT 'Medium',
  assigned_agent text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.defects TO authenticated;
GRANT ALL ON public.defects TO service_role;
ALTER TABLE public.defects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Defects readable by authenticated"
  ON public.defects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert defects"
  ON public.defects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins or owners update defects"
  ON public.defects FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR assigned_agent = public.current_user_name()
    OR created_by = public.current_user_name()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR assigned_agent = public.current_user_name()
    OR created_by = public.current_user_name()
  );
CREATE POLICY "Admins delete defects"
  ON public.defects FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.bump_defect_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER defects_bump_version
  BEFORE UPDATE ON public.defects
  FOR EACH ROW EXECUTE FUNCTION public.bump_defect_version();

-- =========================================
-- Defect Comments
-- =========================================
CREATE TABLE public.defect_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defect_id text NOT NULL REFERENCES public.defects(id) ON DELETE CASCADE,
  author text NOT NULL,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.defect_comments TO authenticated;
GRANT ALL ON public.defect_comments TO service_role;
ALTER TABLE public.defect_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments readable by authenticated"
  ON public.defect_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert comments"
  ON public.defect_comments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins delete comments"
  ON public.defect_comments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- Realtime
-- =========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.defects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.defect_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.forms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
ALTER TABLE public.defects REPLICA IDENTITY FULL;
ALTER TABLE public.defect_comments REPLICA IDENTITY FULL;
ALTER TABLE public.forms REPLICA IDENTITY FULL;

-- =========================================
-- Seed forms
-- =========================================
INSERT INTO public.forms (id, name, module, status, passed, failed, open_defects, last_tested, assigned_agent) VALUES
('1099-NEC','Form 1099-NEC','1099 Forms','Passed',240,5,0, now() - interval '1 day','Arun Kumar'),
('1099-MISC','Form 1099-MISC','1099 Forms','Passed',198,4,0, now() - interval '2 day','Priya Sharma'),
('1099-INT','Form 1099-INT','1099 Forms','Passed',156,3,1, now() - interval '3 day','Arun Kumar'),
('1099-K','Form 1099-K','1099 Forms','In Progress',120,12,4, now() - interval '1 day','Ravi Teja'),
('1099-DIV','Form 1099-DIV','1099 Forms','Passed',132,2,0, now() - interval '4 day','Priya Sharma'),
('1099-R','Form 1099-R','1099 Forms','Open Bug',88,9,3, now() - interval '2 day','Arun Kumar'),
('1099-S','Form 1099-S','1099 Forms','Passed',70,1,0, now() - interval '5 day','Ravi Teja'),
('1099-PATR','Form 1099-PATR','1099 Forms','Pending',0,0,0, now(),'Priya Sharma'),
('1099-B','Form 1099-B','1099 Forms','Passed',110,6,1, now() - interval '3 day','Arun Kumar'),
('1099-C','Form 1099-C','1099 Forms','Retest Required',64,4,2, now() - interval '2 day','Ravi Teja'),
('1099-OID','Form 1099-OID','1099 Forms','Passed',52,1,0, now() - interval '6 day','Priya Sharma'),
('1099-A','Form 1099-A','1099 Forms','Passed',48,0,0, now() - interval '7 day','Arun Kumar'),
('1099-SA','Form 1099-SA','1099 Forms','In Progress',30,5,2, now() - interval '1 day','Ravi Teja'),
('1099-Q','Form 1099-Q','1099 Forms','Passed',44,1,0, now() - interval '4 day','Priya Sharma'),
('1099-G','Form 1099-G','1099 Forms','Passed',80,2,0, now() - interval '5 day','Arun Kumar'),
('1099-DA','Form 1099-DA','1099 Forms','Pending',0,0,0, now(),'Priya Sharma'),
('1099-HC','Form 1099-HC','1099 Forms','Open Bug',35,7,2, now() - interval '1 day','Ravi Teja'),
('1099-LS','Form 1099-LS','1099 Forms','Passed',28,0,0, now() - interval '8 day','Arun Kumar'),
('1097-BTC','Form 1097-BTC','1099 Forms','Passed',24,1,0, now() - interval '6 day','Priya Sharma'),
('1099-QA','Form 1099-QA','1099 Forms','Passed',22,0,0, now() - interval '9 day','Arun Kumar'),
('1099-CORR','Form 1099 Corrections','1099 Forms','In Progress',40,6,3, now() - interval '1 day','Ravi Teja'),
('990','Form 990','990 Forms','Passed',95,3,1, now() - interval '2 day','Priya Sharma'),
('990-N','Form 990-N','990 Forms','Passed',60,1,0, now() - interval '4 day','Arun Kumar'),
('990-T','Form 990-T','990 Forms','Open Bug',42,5,2, now() - interval '1 day','Ravi Teja'),
('990-PF','Form 990-PF','990 Forms','Passed',38,1,0, now() - interval '5 day','Priya Sharma'),
('990-EZ','Form 990-EZ','990 Forms','In Progress',50,4,1, now() - interval '1 day','Arun Kumar'),
('INT-QB','QuickBooks Integration','Integrations','Passed',80,2,0, now() - interval '2 day','Arun Kumar'),
('INT-XR','Xero Integration','Integrations','Passed',65,1,0, now() - interval '3 day','Priya Sharma'),
('INT-ST','Stripe Integration','Integrations','In Progress',48,6,2, now() - interval '1 day','Ravi Teja'),
('INT-SF','Salesforce Integration','Integrations','Open Bug',35,8,3, now() - interval '1 day','Arun Kumar'),
('INT-GD','Google Drive Integration','Integrations','Passed',28,1,0, now() - interval '4 day','Priya Sharma'),
('INT-AUTH','API Authentication','Integrations','Passed',110,3,0, now() - interval '2 day','Ravi Teja'),
('INT-BULK','Bulk Upload API','Integrations','Retest Required',55,5,2, now() - interval '1 day','Arun Kumar'),
('INT-EFILE','E-file API','Integrations','Passed',90,2,0, now() - interval '3 day','Priya Sharma'),
('OL-LOGIN','Portal Login Testing','1099 Online','Passed',40,1,0, now() - interval '2 day','Arun Kumar'),
('OL-CREATE','Form Creation Testing','1099 Online','In Progress',65,7,2, now() - interval '1 day','Ravi Teja'),
('OL-BULK','Bulk Upload Testing','1099 Online','Open Bug',30,5,2, now() - interval '1 day','Priya Sharma'),
('OL-PAY','Payment Flow Testing','1099 Online','Passed',48,2,0, now() - interval '3 day','Arun Kumar'),
('OL-EFILE','E-filing Flow Testing','1099 Online','Passed',55,1,0, now() - interval '2 day','Ravi Teja'),
('OL-DASH','Dashboard Testing','1099 Online','Passed',38,0,0, now() - interval '4 day','Priya Sharma'),
('OL-PDF','PDF Generation Testing','1099 Online','Retest Required',25,3,1, now() - interval '1 day','Arun Kumar'),
('OL-EMAIL','Email Notification Testing','1099 Online','Passed',22,1,0, now() - interval '5 day','Ravi Teja');

INSERT INTO public.defects (id, module, form_feature, title, description, steps_to_reproduce, expected_result, actual_result, status, priority, severity, assigned_agent, created_by, updated_by, jira_url, created_at, updated_at) VALUES
('DEF-1001','1099 Forms','Form 1099-R','Recipient TIN validation accepts invalid format','TIN field accepts non-numeric characters and lets the form submit.','1. Open 1099-R\n2. Enter TIN with letters\n3. Submit','Validation error shown','Form submits successfully','In Progress','High','High','Arun Kumar','Arun Kumar','Arun Kumar','https://jira.example.com/ZEN-1001', now() - interval '3 day', now() - interval '1 day'),
('DEF-1002','Integrations','Salesforce Integration','Token refresh fails after 24 hours','OAuth token does not auto-refresh and API returns 401.','1. Authorize Salesforce\n2. Wait 24h\n3. Trigger sync','Token auto-refreshes silently','401 Unauthorized returned','Reported','Critical','Critical','Ravi Teja','Priya Sharma','Priya Sharma',NULL, now() - interval '2 day', now() - interval '2 day'),
('DEF-1003','1099 Online','Bulk Upload Testing','CSV upload truncates rows beyond 5000','Large CSV files lose rows silently with no error.','1. Upload CSV with 6000 rows\n2. Check imported count','All 6000 rows imported','Only 5000 rows imported','Ongoing','High','Medium','Priya Sharma','Ravi Teja','Ravi Teja',NULL, now() - interval '5 day', now() - interval '1 day'),
('DEF-1004','990 Forms','Form 990-T','Schedule A calculation rounding error','Totals off by $1 due to rounding at each line item.','1. Enter Schedule A items\n2. Compare totals','Exact total','$1 discrepancy','Fixed','Medium','Low','Ravi Teja','Arun Kumar','Ravi Teja',NULL, now() - interval '7 day', now() - interval '2 day'),
('DEF-1005','1099 Forms','Form 1099-HC','Print preview misaligned in landscape','Header overlaps body text in landscape print preview.','1. Open 1099-HC\n2. Print preview landscape','Clean layout','Header overlaps content','Reopened','Medium','Medium','Arun Kumar','Saisrija','Saisrija',NULL, now() - interval '10 day', now() - interval '1 day'),
('DEF-1006','1099 Online','PDF Generation Testing','Generated PDF missing watermark on draft','Draft PDFs should include the DRAFT watermark.','1. Save form as draft\n2. Download PDF','DRAFT watermark visible','No watermark','Retest Required','Low','Low','Priya Sharma','Arun Kumar','Priya Sharma',NULL, now() - interval '6 day', now() - interval '1 day');
