-- Add an explicit demonstrative dimension so patrimonial movements are not forced into the DRE.
-- Existing data remains compatible as Resultado by default.

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS statement_type text NOT NULL DEFAULT 'resultado',
  ADD COLUMN IF NOT EXISTS balance_group text;

ALTER TABLE public.training_examples
  ADD COLUMN IF NOT EXISTS statement_type text NOT NULL DEFAULT 'resultado',
  ADD COLUMN IF NOT EXISTS balance_group text;

ALTER TABLE public.rules
  ADD COLUMN IF NOT EXISTS statement_type text NOT NULL DEFAULT 'resultado',
  ADD COLUMN IF NOT EXISTS balance_group text;

ALTER TABLE public.account_mappings
  ADD COLUMN IF NOT EXISTS statement_type text NOT NULL DEFAULT 'resultado',
  ADD COLUMN IF NOT EXISTS balance_group text;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_statement_type_check
    CHECK (statement_type IN ('resultado', 'balanco')),
  ADD CONSTRAINT entries_balance_group_check
    CHECK (balance_group IS NULL OR balance_group IN ('ativo', 'passivo', 'patrimonio_liquido')),
  ADD CONSTRAINT entries_statement_balance_consistency_check
    CHECK (
      (statement_type = 'resultado' AND balance_group IS NULL)
      OR
      (statement_type = 'balanco' AND balance_group IS NOT NULL)
    );

ALTER TABLE public.training_examples
  ADD CONSTRAINT training_examples_statement_type_check
    CHECK (statement_type IN ('resultado', 'balanco')),
  ADD CONSTRAINT training_examples_balance_group_check
    CHECK (balance_group IS NULL OR balance_group IN ('ativo', 'passivo', 'patrimonio_liquido')),
  ADD CONSTRAINT training_examples_statement_balance_consistency_check
    CHECK (
      (statement_type = 'resultado' AND balance_group IS NULL)
      OR
      (statement_type = 'balanco' AND balance_group IS NOT NULL)
    );

ALTER TABLE public.rules
  ADD CONSTRAINT rules_statement_type_check
    CHECK (statement_type IN ('resultado', 'balanco')),
  ADD CONSTRAINT rules_balance_group_check
    CHECK (balance_group IS NULL OR balance_group IN ('ativo', 'passivo', 'patrimonio_liquido')),
  ADD CONSTRAINT rules_statement_balance_consistency_check
    CHECK (
      (statement_type = 'resultado' AND balance_group IS NULL)
      OR
      (statement_type = 'balanco' AND balance_group IS NOT NULL)
    );

ALTER TABLE public.account_mappings
  ADD CONSTRAINT account_mappings_statement_type_check
    CHECK (statement_type IN ('resultado', 'balanco')),
  ADD CONSTRAINT account_mappings_balance_group_check
    CHECK (balance_group IS NULL OR balance_group IN ('ativo', 'passivo', 'patrimonio_liquido')),
  ADD CONSTRAINT account_mappings_statement_balance_consistency_check
    CHECK (
      (statement_type = 'resultado' AND balance_group IS NULL)
      OR
      (statement_type = 'balanco' AND balance_group IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS entries_client_statement_type_idx
  ON public.entries (client_id, statement_type);

CREATE INDEX IF NOT EXISTS training_examples_client_statement_type_idx
  ON public.training_examples (client_id, statement_type)
  WHERE active;
