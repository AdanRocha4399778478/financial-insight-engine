-- Foundation for client-specific historical training examples.
-- This table stores confirmed historical examples imported from legacy sources
-- (Power Query, Power BI, spreadsheets, etc.) without turning every row into a rule.

CREATE TABLE public.training_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  counterparty text,
  original_category text,
  history_key text NOT NULL,
  account text NOT NULL,
  nature public.entry_nature NOT NULL,
  behavior public.entry_behavior NOT NULL DEFAULT 'nao_definido',
  area text,
  source_type text NOT NULL DEFAULT 'historical_import',
  source_file text,
  source_row_number integer,
  fingerprint text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT training_examples_history_key_not_blank CHECK (btrim(history_key) <> ''),
  CONSTRAINT training_examples_fingerprint_not_blank CHECK (btrim(fingerprint) <> ''),
  CONSTRAINT training_examples_source_row_number_positive CHECK (source_row_number IS NULL OR source_row_number > 0),
  CONSTRAINT training_examples_client_fingerprint_key UNIQUE (client_id, fingerprint)
);

CREATE INDEX training_examples_client_history_key_idx
  ON public.training_examples (client_id, history_key)
  WHERE active;

CREATE INDEX training_examples_client_created_at_idx
  ON public.training_examples (client_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_examples TO authenticated;
GRANT ALL ON public.training_examples TO service_role;

ALTER TABLE public.training_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY training_examples_access
  ON public.training_examples
  FOR ALL
  TO authenticated
  USING (public.can_access_client(auth.uid(), client_id))
  WITH CHECK (public.can_access_client(auth.uid(), client_id));

CREATE TRIGGER training_examples_updated_at
  BEFORE UPDATE ON public.training_examples
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
