-- Carga inicial do Balanço Patrimonial para Bandrones, período único
-- 2026-07-01. Dado fornecido e conferido por Adan contra a planilha
-- original; re-somado mecanicamente (script) antes de aplicar e bate
-- exatamente com os totais esperados: Total Ativo R$477.033,13 / Total
-- Passivo R$247.502,24 / PL R$229.530,89.
--
-- Nota: as instruções mencionavam "26 contas", mas a lista detalhada
-- fornecida tem 30 itens (21 Ativo: 2 circulante + 19 não circulante;
-- 9 Passivo: 6 circulante + 3 não circulante) — usado o valor da lista
-- item a item, que é o que soma exatamente aos totais esperados.

BEGIN;

WITH new_accounts AS (
  INSERT INTO public.balance_accounts (client_id, name, balance_group, balance_subgroup, active)
  VALUES
    -- Bandrones — Ativo / Circulante
    ('16955e5e-119a-406d-974d-d838e671f853', 'Caixa', 'ativo', 'circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'A Receber', 'ativo', 'circulante', true),
    -- Bandrones — Ativo / Não Circulante
    ('16955e5e-119a-406d-974d-d838e671f853', 'Hilux 2008', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Drone - T40', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Drone - T25 (1)', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Drone - T25 (2)', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Gerador Toyama 12 kva', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Gerador Toyama 10 kva', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Gerador Bufalo 11 kva', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Estrutura e Misturador de Caldas', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Carregador T40', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Carregador T25', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Bateria T40 - 1', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Bateria T40 - 2', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Bateria T40 - 3', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Bateria T25 (1) - 1', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Bateria T25 (1) - 2', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Bateria T25 (1) - 3', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Bateria T25 (2) - 1', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Bateria T25 (2) - 2', 'ativo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Bateria T25 (2) - 3', 'ativo', 'nao_circulante', true),
    -- Bandrones — Passivo / Circulante
    ('16955e5e-119a-406d-974d-d838e671f853', 'Cartões', 'passivo', 'circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Manutenção de Veículo', 'passivo', 'circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Consórcio (Circulante)', 'passivo', 'circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Financiamento Drone T25 (2) - Circulante', 'passivo', 'circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Financiamento Drone T40 - Circulante', 'passivo', 'circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Financiamento Gerador Bufalo 11 kva - Circulante', 'passivo', 'circulante', true),
    -- Bandrones — Passivo / Não Circulante
    ('16955e5e-119a-406d-974d-d838e671f853', 'Consórcio (Não Circulante)', 'passivo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Financiamento Drone T25 (1) - Não Circulante', 'passivo', 'nao_circulante', true),
    ('16955e5e-119a-406d-974d-d838e671f853', 'Financiamento Drone T40 - Não Circulante', 'passivo', 'nao_circulante', true)
  RETURNING id, client_id, name
),
entry_values (client_id, name, period, value) AS (
  VALUES
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Caixa', '2026-07-01'::date, 4993.13::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'A Receber', '2026-07-01'::date, 23040::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Hilux 2008', '2026-07-01'::date, 84000::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Drone - T40', '2026-07-01'::date, 74254::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Drone - T25 (1)', '2026-07-01'::date, 58900::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Drone - T25 (2)', '2026-07-01'::date, 46000::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Gerador Toyama 12 kva', '2026-07-01'::date, 14500::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Gerador Toyama 10 kva', '2026-07-01'::date, 9000::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Gerador Bufalo 11 kva', '2026-07-01'::date, 9500::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Estrutura e Misturador de Caldas', '2026-07-01'::date, 20000::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Carregador T40', '2026-07-01'::date, 18532::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Carregador T25', '2026-07-01'::date, 14600::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Bateria T40 - 1', '2026-07-01'::date, 15738::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Bateria T40 - 2', '2026-07-01'::date, 15738::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Bateria T40 - 3', '2026-07-01'::date, 15738::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Bateria T25 (1) - 1', '2026-07-01'::date, 12500::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Bateria T25 (1) - 2', '2026-07-01'::date, 12500::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Bateria T25 (1) - 3', '2026-07-01'::date, 12500::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Bateria T25 (2) - 1', '2026-07-01'::date, 5000::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Bateria T25 (2) - 2', '2026-07-01'::date, 5000::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Bateria T25 (2) - 3', '2026-07-01'::date, 5000::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Cartões', '2026-07-01'::date, 4970::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Manutenção de Veículo', '2026-07-01'::date, 3984.48::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Consórcio (Circulante)', '2026-07-01'::date, 14784::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Financiamento Drone T25 (2) - Circulante', '2026-07-01'::date, 10528::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Financiamento Drone T40 - Circulante', '2026-07-01'::date, 51360::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Financiamento Gerador Bufalo 11 kva - Circulante', '2026-07-01'::date, 8350::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Consórcio (Não Circulante)', '2026-07-01'::date, 25872::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Financiamento Drone T25 (1) - Não Circulante', '2026-07-01'::date, 42053.76::numeric),
    ('16955e5e-119a-406d-974d-d838e671f853'::uuid, 'Financiamento Drone T40 - Não Circulante', '2026-07-01'::date, 85600::numeric)
)
INSERT INTO public.balance_manual_entries (client_id, account_id, period, value, updated_at)
SELECT na.client_id, na.id, ev.period, ev.value, now()
FROM new_accounts na
JOIN entry_values ev ON ev.client_id = na.client_id AND ev.name = na.name;

COMMIT;
