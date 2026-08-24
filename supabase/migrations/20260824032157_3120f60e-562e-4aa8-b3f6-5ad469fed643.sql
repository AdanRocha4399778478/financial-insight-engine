-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'consultor');
CREATE TYPE public.entry_nature AS ENUM ('receita_bruta','deducao','custo','despesa','receita_financeira','despesa_financeira','outra_receita','outra_despesa','transferencia','excluido','nao_definido');
CREATE TYPE public.entry_behavior AS ENUM ('fixo','variavel','misto','nao_aplicavel','nao_definido');
CREATE TYPE public.entry_status AS ENUM ('auto','sugerido','pendente','confirmado','ignorado');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- new user trigger: profile + first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  IF (SELECT count(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'consultor');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- CLIENTS
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trade_name text,
  industry text,
  segment text,
  revenue_model text,
  dimensions text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.client_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE (client_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.client_users TO authenticated;
GRANT ALL ON public.client_users TO service_role;
ALTER TABLE public.client_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_client(_user_id uuid, _client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id,'admin')
      OR EXISTS (SELECT 1 FROM public.client_users cu WHERE cu.client_id = _client_id AND cu.user_id = _user_id)
$$;

CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated USING (public.can_access_client(auth.uid(), id));
CREATE POLICY "clients_admin_write" ON public.clients FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "client_users_select" ON public.client_users FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "client_users_admin_write" ON public.client_users FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- COLUMN MAPPINGS
CREATE TABLE public.column_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  signature text NOT NULL,
  mapping jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, signature)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.column_mappings TO authenticated;
GRANT ALL ON public.column_mappings TO service_role;
ALTER TABLE public.column_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "column_mappings_access" ON public.column_mappings FOR ALL TO authenticated USING (public.can_access_client(auth.uid(), client_id)) WITH CHECK (public.can_access_client(auth.uid(), client_id));

-- IMPORTS
CREATE TABLE public.imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  filename text NOT NULL,
  period_label text,
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  pending_rows integer NOT NULL DEFAULT 0,
  mapping jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports TO authenticated;
GRANT ALL ON public.imports TO service_role;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imports_access" ON public.imports FOR ALL TO authenticated USING (public.can_access_client(auth.uid(), client_id)) WITH CHECK (public.can_access_client(auth.uid(), client_id));

-- ENTRIES
CREATE TABLE public.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  import_id uuid REFERENCES public.imports(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  description text NOT NULL DEFAULT '',
  counterparty text,
  amount numeric(16,2) NOT NULL DEFAULT 0,
  movement_type text,
  original_category text,
  document text,
  cost_center text,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint text NOT NULL,
  account text,
  nature public.entry_nature NOT NULL DEFAULT 'nao_definido',
  behavior public.entry_behavior NOT NULL DEFAULT 'nao_definido',
  area text,
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  classification_source text,
  status public.entry_status NOT NULL DEFAULT 'pendente',
  excluded_from_dre boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX entries_client_fingerprint_idx ON public.entries (client_id, fingerprint);
CREATE INDEX entries_client_date_idx ON public.entries (client_id, entry_date);
CREATE INDEX entries_status_idx ON public.entries (client_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT ALL ON public.entries TO service_role;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entries_access" ON public.entries FOR ALL TO authenticated USING (public.can_access_client(auth.uid(), client_id)) WITH CHECK (public.can_access_client(auth.uid(), client_id));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER entries_updated_at BEFORE UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RULES
CREATE TABLE public.rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  segment text,
  match_field text NOT NULL DEFAULT 'description',
  pattern text NOT NULL,
  account text NOT NULL,
  nature public.entry_nature NOT NULL,
  behavior public.entry_behavior NOT NULL DEFAULT 'nao_definido',
  area text,
  confirmed boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  hits integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rules_client_idx ON public.rules (client_id) WHERE active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rules TO authenticated;
GRANT ALL ON public.rules TO service_role;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rules_select" ON public.rules FOR SELECT TO authenticated USING (client_id IS NULL OR public.can_access_client(auth.uid(), client_id));
CREATE POLICY "rules_write_client" ON public.rules FOR ALL TO authenticated USING (client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id)) WITH CHECK (client_id IS NOT NULL AND public.can_access_client(auth.uid(), client_id));
CREATE POLICY "rules_write_admin" ON public.rules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- AUDIT
CREATE TABLE public.classification_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.entries(id) ON DELETE CASCADE,
  user_id uuid,
  previous jsonb,
  next jsonb,
  source text,
  confidence numeric(4,3),
  became_rule boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_client_idx ON public.classification_audit (client_id, created_at DESC);
GRANT SELECT, INSERT ON public.classification_audit TO authenticated;
GRANT ALL ON public.classification_audit TO service_role;
ALTER TABLE public.classification_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_access" ON public.classification_audit FOR SELECT TO authenticated USING (public.can_access_client(auth.uid(), client_id));
CREATE POLICY "audit_insert" ON public.classification_audit FOR INSERT TO authenticated WITH CHECK (public.can_access_client(auth.uid(), client_id));