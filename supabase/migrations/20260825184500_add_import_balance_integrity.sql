-- Persist bank import integrity evidence without changing existing imports.
-- NULL status means the import predates this validation or does not apply (for example, DRE-ready imports).

ALTER TABLE public.imports
  ADD COLUMN integrity_status text,
  ADD COLUMN opening_balance numeric(16,2),
  ADD COLUMN opening_balance_source text,
  ADD COLUMN closing_balance numeric(16,2),
  ADD COLUMN closing_balance_source text,
  ADD COLUMN calculated_balance numeric(16,2),
  ADD COLUMN balance_difference numeric(16,2),
  ADD COLUMN balance_tolerance numeric(16,2),
  ADD COLUMN integrity_checked_at timestamptz;

ALTER TABLE public.imports
  ADD CONSTRAINT imports_integrity_status_check
    CHECK (
      integrity_status IS NULL OR integrity_status IN (
        'conciliado',
        'divergente',
        'fechamento_inferido',
        'nao_verificado'
      )
    ),
  ADD CONSTRAINT imports_opening_balance_source_check
    CHECK (
      opening_balance_source IS NULL OR opening_balance_source IN (
        'manual',
        'extrato',
        'inferido'
      )
    ),
  ADD CONSTRAINT imports_closing_balance_source_check
    CHECK (
      closing_balance_source IS NULL OR closing_balance_source IN (
        'manual',
        'extrato',
        'inferido'
      )
    ),
  ADD CONSTRAINT imports_balance_tolerance_check
    CHECK (balance_tolerance IS NULL OR balance_tolerance >= 0);

COMMENT ON COLUMN public.imports.integrity_status IS
  'Resultado da conferência matemática da importação bancária. NULL para imports não avaliados ou não aplicáveis.';
COMMENT ON COLUMN public.imports.opening_balance_source IS
  'Origem da evidência do saldo inicial: manual, extrato ou inferido.';
COMMENT ON COLUMN public.imports.closing_balance_source IS
  'Origem da evidência do saldo final: manual, extrato ou inferido.';
