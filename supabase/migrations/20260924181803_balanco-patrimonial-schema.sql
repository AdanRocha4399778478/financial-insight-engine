-- Balanço Patrimonial: circulante/não circulante em entries, plano de contas
-- patrimonial próprio e lançamentos manuais mensais por conta (saldos que não
-- vêm de importação de extrato, ex.: imobilizado, capital social).

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS balance_subgroup text;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_balance_subgroup_check
    CHECK (balance_subgroup IS NULL OR balance_subgroup IN ('circulante', 'nao_circulante')),
  ADD CONSTRAINT entries_balance_subgroup_consistency_check
    CHECK (balance_subgroup IS NULL OR balance_group IN ('ativo', 'passivo'));

-- BALANCE ACCOUNTS
CREATE TABLE public.balance_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  balance_group text NOT NULL,
  balance_subgroup text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT balance_accounts_balance_group_check
    CHECK (balance_group IN ('ativo', 'passivo', 'patrimonio_liquido')),
  CONSTRAINT balance_accounts_subgroup_check
    CHECK (balance_subgroup IS NULL OR balance_subgroup IN ('circulante', 'nao_circulante')),
  CONSTRAINT balance_accounts_subgroup_consistency_check
    CHECK (balance_subgroup IS NULL OR balance_group IN ('ativo', 'passivo')),
  UNIQUE (client_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.balance_accounts TO authenticated;
GRANT ALL ON public.balance_accounts TO service_role;
ALTER TABLE public.balance_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY balance_accounts_access ON public.balance_accounts FOR ALL TO authenticated
  USING (public.can_access_client(auth.uid(), client_id))
  WITH CHECK (public.can_access_client(auth.uid(), client_id));

-- BALANCE MANUAL ENTRIES
CREATE TABLE public.balance_manual_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.balance_accounts(id) ON DELETE RESTRICT,
  period date NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (account_id, period)
);

CREATE INDEX balance_manual_entries_client_period_idx
  ON public.balance_manual_entries (client_id, period);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.balance_manual_entries TO authenticated;
GRANT ALL ON public.balance_manual_entries TO service_role;
ALTER TABLE public.balance_manual_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY balance_manual_entries_access ON public.balance_manual_entries FOR ALL TO authenticated
  USING (public.can_access_client(auth.uid(), client_id))
  WITH CHECK (public.can_access_client(auth.uid(), client_id));
CREATE TRIGGER balance_manual_entries_updated_at BEFORE UPDATE ON public.balance_manual_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
