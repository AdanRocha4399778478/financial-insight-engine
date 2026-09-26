-- Reclassificação de 40 lançamentos do Grupo Erinho (29892c60-a17f-413a-9913-e781219f1932)
-- com sinal "invertido" (custo+, despesa+, receita_bruta-, receita_financeira-),
-- investigados individualmente (GATE de reclassificação, 25/09/2026):
--
-- 1. 25 lançamentos "ERINHO AUTO PECAS" (CNPJ 20678494000175) -> transferência
--    interna confirmada, exclui da DRE.
-- 2. 1 lançamento "REI DOS ENGATES" (-R$365,00) -> custo real, mantém conta CMV.
-- 3. 3 lançamentos de Lucas Gabriel Nogueira (CPF 15620278913) -> pendente
--    (classificação incerta, requer revisão humana).
-- 4. 4 lançamentos POSITIVOS de Lucas Gabriel Marques (CPF 11512452912,
--    conta "Gratificação") -> pendente. Os 7 lançamentos NEGATIVOS dele em
--    CMV não são tocados (nature=custo, sinal normal, ficam como estão).
-- 5. 2 lançamentos de Stephanny Myllene Carr (CPF 09718627960) -> pendente.
-- 6. 5 lançamentos "TARIFA LIBERACAO CREDITO" (incl. variação "C60332668")
--    -> despesa_financeira, conta "Antecipação de Recebíveis - Tarifas",
--    behavior variavel (mesma regra já existente e correta no sistema,
--    id 621e605f-7264-4eb8-8049-fe565f4ad4bc, que não estava sendo aplicada
--    por conflito de precedência com uma regra mais genérica).
--
-- Agiliza Transport (CNPJ 59766494000162, 3 lançamentos) NÃO é tocada aqui:
-- é reversão legítima confirmada de um fornecedor real, fica como está.

-- 1. Erinho Auto Peças -> transferência (exclui da DRE)
update entries
set nature = 'transferencia'
where id in (
  '9cf04bfb-e049-459c-8001-ac6d49774e09',
  '9eedf33b-084d-452f-8de0-5ec2fcf76858',
  '3bf89ad8-ef2f-4ed2-b6ee-1239f14fcb98',
  '04a6f27e-5cbd-4d7b-96fb-5f8907d2f23e',
  '1ad51615-7c8d-4550-bddc-fca73eb82f36',
  '6b8f52f8-cdb8-4078-aa55-21d9bb46fe93',
  'b3822358-dfcd-4b4a-8e9e-ec30d90cff42',
  '5391dcf6-9c5a-4bc0-b425-1f59adeb8b2c',
  '29a64f11-6095-4f83-9ec0-96345e883408',
  '93bf49b5-d9ba-48b5-a11b-6db50fdf6928',
  '68edfec2-ab0c-4437-a192-71d11ffa0c10',
  'e37036c6-e550-4712-8b79-53da9d1868ab',
  'cca7d475-1b4d-4f82-baad-847441c299de',
  '7e7621a4-e871-42fe-afc2-3aba4c88c21a',
  'e7aab08a-92ea-4eab-9cfd-8f8144ab243e',
  'de9790da-e375-4068-81ab-f01bdc129658',
  '6e584bd4-c3d1-4888-bbda-87a568be5bae',
  '99653c26-f40f-419a-aeb8-5a08f5ead66d',
  'b98ad178-ed2f-4875-867d-55ed5652fbad',
  'c1dd12d5-52fb-4c4d-ae15-68a629f2c458',
  '669bb3b4-e609-4b93-99e4-b3d28c91ca24',
  '2c204528-40ab-4fd7-b031-08971f2cf8f8',
  'eb8bfda4-5490-4d9e-920a-9e07033bb56a',
  '655128d1-2f86-4269-8237-fba9d383f164',
  '4bc40025-0191-43d5-adb6-5af0241646ee'
);

-- 2. Rei dos Engates -> custo real, mantém conta CMV
update entries
set nature = 'custo'
where id = '6ebf8bf8-fd7b-4395-a594-7af89ba3750d';

-- 3 e 4. Lucas Gabriel Nogueira (3) + Lucas Gabriel Marques positivos (4) -> pendente
update entries
set
  nature = 'nao_definido',
  behavior = 'nao_definido',
  account = null,
  area = null,
  confidence = 0,
  classification_source = 'sem_correspondencia',
  status = 'pendente'
where id in (
  '41fda7f8-1cea-4dce-a7bb-be3faf9a87f0',
  'f183a00d-5457-4691-b64f-eda395bf4a2e',
  'b1140d56-88f4-495a-af47-a1a7eae8a174',
  '7b5f24c8-748f-421b-99c6-8bb7216f6a40',
  'bb1c194f-9148-4255-a183-b72273f3415c',
  '9b87a092-4035-48b9-98f5-a3e3c304d534',
  '46b363ee-d90c-4405-978c-16b4e2e3b2f3'
);

-- 5. Stephanny Myllene Carr -> pendente
update entries
set
  nature = 'nao_definido',
  behavior = 'nao_definido',
  account = null,
  area = null,
  confidence = 0,
  classification_source = 'sem_correspondencia',
  status = 'pendente'
where id in (
  '2badf111-4a02-4745-8b3a-e92a9acfb750',
  'c5b13555-c92c-46c7-97f2-ef6811243791'
);

-- 6. Tarifa Liberação Crédito -> despesa_financeira, conta correta
update entries
set
  nature = 'despesa_financeira',
  account = 'Antecipação de Recebíveis - Tarifas',
  behavior = 'variavel'
where id in (
  'bcb33432-954c-49b1-b0cb-1e3b69b33fd2',
  '7cd64ae9-267c-4d5b-a0fb-37c89c45b54e',
  '8edca8eb-badb-455f-b81d-b383ed009042',
  '4ef6c0af-f58a-4435-b893-db19f321eed9',
  '793e98a8-a1fe-444c-8abf-81daaed1315d'
);
