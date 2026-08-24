ALTER TABLE public.imports ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'movimentos';

CREATE TABLE public.account_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  account_name text NOT NULL DEFAULT '',
  nature entry_nature NOT NULL DEFAULT 'nao_definido',
  behavior entry_behavior NOT NULL DEFAULT 'nao_definido',
  area text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (client_id, account_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_mappings TO authenticated;
GRANT ALL ON public.account_mappings TO service_role;
ALTER TABLE public.account_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_mappings_access ON public.account_mappings FOR ALL TO authenticated
  USING (public.can_access_client(auth.uid(), client_id))
  WITH CHECK (public.can_access_client(auth.uid(), client_id));
CREATE TRIGGER account_mappings_updated_at BEFORE UPDATE ON public.account_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.dre_facts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  import_id uuid REFERENCES public.imports(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  account_name text NOT NULL DEFAULT '',
  period date NOT NULL,
  period_label text,
  amount numeric NOT NULL DEFAULT 0,
  fingerprint text NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (client_id, fingerprint)
);

CREATE INDEX dre_facts_client_period_idx ON public.dre_facts (client_id, period);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dre_facts TO authenticated;
GRANT ALL ON public.dre_facts TO service_role;
ALTER TABLE public.dre_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY dre_facts_access ON public.dre_facts FOR ALL TO authenticated
  USING (public.can_access_client(auth.uid(), client_id))
  WITH CHECK (public.can_access_client(auth.uid(), client_id));
CREATE TRIGGER dre_facts_updated_at BEFORE UPDATE ON public.dre_facts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();