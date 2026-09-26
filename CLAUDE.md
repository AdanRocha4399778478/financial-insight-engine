# Financial Insight Engine — contexto para o Claude Code

Este arquivo é lido automaticamente pelo Claude Code no início de cada sessão
neste repositório. Mantenha-o atualizado conforme o produto evolui — ele existe
para que nenhuma sessão comece do zero sem contexto.

## O que é este produto

Motor de inteligência financeira gerencial da **Resultados S/A**, ancorando o
produto "Verdade Financeira". Transforma extrato/relatório financeiro bruto de
um cliente em DRE gerencial classificada, auditável e confiável — sem planilha
manual.

**Princípio inegociável do produto:** o sistema nunca deve mostrar um número
como correto quando não tem certeza dele. Pendência explícita é sempre
preferível a uma classificação ou valor inventado. Isso vale tanto para a IA de
sugestão quanto para qualquer lógica de cálculo ou parsing.

> **⚠️ Bloqueio de segurança em aberto (22/09/2026):** o Teste G da spec
> original (critério de aceite "Segurança" — um usuário não acessa clientes
> para os quais não possui permissão) foi verificado **apenas por leitura de
> código** (as políticas de RLS em `supabase/migrations/...client_users...`
> usam `can_access_client()` corretamente), **nunca ao vivo**. O único usuário
> existente no projeto é admin, que bypassa `client_users` por design — não há
> conta consultor de teste para reproduzir o caso negativo.
> **NENHUM usuário não-admin deve ser criado** antes de um teste ao vivo
> confirmar que (1) a tela `/clientes` fica vazia para um consultor sem
> `client_users` em nenhum cliente, e (2) a URL direta de um cliente não
> autorizado é bloqueada. Qualquer sessão que for convidar um consultor real
> precisa resolver isso antes.

## Stack

- Frontend/backend: TanStack Start (React) + Vite, TypeScript
- Banco: Supabase (Postgres + Auth + RLS)
- Hospedagem: Vercel (produção). **Não há mais dependência do Lovable** — o
  projeto foi migrado para desenvolvimento direto via Claude Code, com Supabase
  próprio, justamente para sair do ciclo de prompt-e-espera do agente da
  Lovable e ter controle direto do código.

## Estrutura do código

- `src/lib/*.functions.ts` — server functions (TanStack), uma por domínio:
  `clients`, `entries`, `imports`, `dre`, `dre-import`.
- `src/lib/classify.ts` — motor de classificação. Cascata de prioridade em 7
  níveis (regra do cliente → regra global → histórico do cliente → IA, com teto
  de confiança 0.8 → pendência). **Nunca altere a ordem dessa cascata sem
  entender o impacto em todos os clientes já configurados.**
- `src/lib/finance.ts` — taxonomia de natureza/comportamento e cálculo da DRE
  (Receita Bruta → Margem Bruta → Margem de Contribuição → EBITDA → Resultado
  Financeiro/Não Operacional → Resultado Líquido).
- `src/lib/parse-file.ts` — parsing de XLSX/CSV para importação. **Contém um
  bug crítico já corrigido uma vez** (ver seção "Bugs críticos já encontrados"
  abaixo) — qualquer mudança aqui precisa de teste de regressão manual antes de
  confiar.
- `src/routes/_authenticated/clientes.$clientId.*` — páginas de cada aba do
  cliente (Importar, Classificação, Contas, DRE, Indicadores, Governança).
- `supabase/migrations/` — schema completo do banco, aplicado em ordem
  cronológica pelo nome do arquivo.

## Taxonomia financeira (natureza)

| Natureza (enum) | Rótulo | Onde entra na DRE |
|---|---|---|
| `receita_bruta` | Receita Bruta | Topo |
| `deducao` | Dedução da Receita | Redutor da Receita Bruta |
| `custo` | Custo | Custos Variáveis/Fixos → Margem Bruta |
| `despesa` | Despesa | Despesas Variáveis/Fixas → EBITDA |
| `receita_financeira` | Receita Financeira | Resultado Financeiro (fora do EBITDA) |
| `despesa_financeira` | Despesa Financeira | Resultado Financeiro (fora do EBITDA) |
| `outra_receita` / `outra_despesa` | Outra Receita/Despesa | Resultado Não Operacional (fora do EBITDA) |
| `transferencia` / `excluido` | Transferência / Excluído da DRE | Não entra na DRE |

**Critério já validado com o time:** juros e tarifa bancária pura são sempre
`despesa_financeira` (nunca entram no EBITDA). Taxa de administração de cartão
é `despesa` variável operacional (é custo direto de vender, mesmo sendo
cobrada por banco/operadora). Ver `manual_classificacao_financeira.docx` para o
critério completo e o protocolo de como registrar novos critérios.

## Bugs críticos já encontrados (não reintroduzir)

1. **Parsing numérico locale-dependente (corrigido em 15/09/2026).**
   `parseNumber` em `parse-file.ts` assumia que "." é sempre separador de
   milhar e "," é sempre decimal. Como o XLSX é lido com valores formatados
   (não brutos), um valor como "18,500.00" (formato americano) virava 18.5 —
   silenciosamente, sem erro, sem descartar a linha. Correção aplicada: usar o
   valor numérico bruto da célula quando disponível; para texto/CSV, detectar
   o separador decimal pelo último símbolo não-dígito da string. **Qualquer
   alteração no parser de valores precisa de teste com um valor > 1000 com
   separador de milhar em formato americano E brasileiro antes de merge.**

## Protocolo de teste (não pule isso)

Toda mudança relevante em classificação, DRE ou importação deve ser validada
reproduzindo o caso real, não apenas testada com um caso novo escolhido
livremente. Se um bug foi encontrado com um dado específico, a correção só é
aceita quando **o mesmo dado que quebrou** passa a funcionar — "eu testei e
funcionou" com outro caso não é confirmação suficiente.

## Backlog conhecido (em aberto)

- Zero testes automatizados dos critérios de aceite da spec original (A–G).
  Prioridade alta antes de qualquer cliente real usar o sistema para decisão.
- Tela de redefinição de senha ausente no fluxo de autenticação.
- Recurso de "importar regras em lote" (aba Governança) tem bug de leitura de
  planilha — colunas não são reconhecidas e a contagem de linhas lidas não
  fecha com o total do arquivo. Ver `regras_teste_cliente_teste.xlsx` como
  caso de reprodução (10 linhas desenhadas para testar casos-limite: regra
  global, conflito com regra existente, natureza inválida, padrão vazio,
  cliente inexistente, duplicata interna).
- Sugestão por IA (`suggestWithAI`) dependia de `LOVABLE_API_KEY`, exclusivo da
  infraestrutura da Lovable. Precisa ser adaptado para usar uma chave própria
  (OpenAI ou Google Gemini) ou ficar desligado até decisão.
- SMTP de e-mail não configurado — usando o padrão do Supabase, com rate limit
  muito baixo para uso real (recuperação de senha, convite de usuário).
- **[Importante] Warning de ciclo de vida do React na tela de DRE**, encontrado
  em 22/09/2026 durante validação do PR #4 (`feat/import-balance-integrity`):
  console mostra `Can't perform a React state update on a component that
  hasn't mounted yet. This indicates that you have a side-effect in your
  render function that asynchronously tries to update the component. Move
  this work to useEffect instead.` Intermitente — reproduziu em recarregamento
  limpo da DRE do Bandrones, não reproduziu no mesmo teste no Grupo Erinho. Não
  bloqueia o render (os números da DRE aparecem corretos), mas indica um
  side-effect disparado no corpo de render em vez de `useEffect` em algum
  componente da rota `clientes.$clientId.dre`. Investigar antes do próximo
  trabalho nessa tela.
- **Vulnerabilidades de dependências (npm audit, 22/09/2026)**, sem relação com
  o merge de `feat/import-balance-integrity` — pré-existentes, encontradas ao
  rodar `npm install` durante a validação do PR #4:
  - `js-yaml` 4.0.0–4.3.1: alta severidade, "maxTotalMergeKeys does not limit
    CPU use for empty merge sources" — corrigível via `npm audit fix`.
  - `xlsx` (todas as versões atuais): alta severidade, Prototype Pollution e
    ReDoS na SheetJS — **sem fix disponível** via npm; `xlsx` é dependência
    direta do parser de importação (`parse-file.ts`), então trocar de
    biblioteca exige avaliação cuidadosa, não é um bump trivial.
- **Erro 404 residual em toda página**, notado em 22/09/2026 durante validação
  do PR #4: exatamente uma requisição retorna 404 no console em todo
  carregamento de página, em qualquer rota — ocorrência única, não cresce
  com navegação ou ações, não identificada ainda (o console não expõe a URL
  do recurso), não bloqueia nenhuma funcionalidade. Confirmado pré-existente
  ao merge de hoje (mesmo padrão observado em testes anteriores ao merge).
  Investigar a origem quando houver tempo.
  Investigar depois, não bloqueia este merge.
- ~~35 migrations aplicadas diretamente em produção entre 21/09 e 22/09
  sem arquivo correspondente neste repositório~~ **Reparado em 23/09/2026,
  bookkeeping apenas, sem alteração de dado.** Descoberto em 22/09/2026 via
  `supabase migration list` durante o gate 7 do PR #4 (35 timestamps
  remotos de `2026-09-21 18:08:14` a `2026-09-22 03:16:30`, sem arquivo
  local). Investigação confirmou que eram infraestrutura gerenciada pelo
  próprio Supabase (função `rls_auto_enable()` — habilita RLS
  automaticamente em tabelas novas do schema `public` — e triggers de
  proteção de `storage.buckets`), não mudanças feitas por alguém da
  equipe. Reparo: `supabase migration repair --status reverted` nas 35
  versões (autorizado por Adan), seguido de `supabase db pull`, que gerou
  `supabase/migrations/20260923025752_remote_schema.sql` capturando esse
  estado. `supabase migration list` confirmou local e remoto batendo, sem
  órfãs. Nenhum dado ou tabela de aplicação (`clients`, `entries`,
  `dre_facts`, `classification_audit` etc.) foi tocado.
- **Tela "Visão geral" mostrou dados zerados momentaneamente em produção**,
  notado em 22/09/2026 no recheque pós-deploy do PR #4: Visão geral do
  Bandrones mostrou 0 lançamentos/0 pendências momentaneamente em produção,
  logo após o deploy; Governança e DRE confirmaram dados corretos na
  sequência. Causa não identificada — pode ou não ser o mesmo bug de ciclo
  de vida já registrado na DRE. Investigar antes de confiar na Visão geral
  como fonte de verdade rápida.
- **Grupo Erinho tem 294 lançamentos automáticos em julho/2026**, acima do
  limite de 200 por consulta — corte agora é visível via banner, mas
  paginação real continua pendente como melhoria futura, não bug.
- ~~DRE do Bandrones mostra vazio no primeiro carregamento de um mês
  específico~~ **Corrigido em 24/09/2026.** Causa real: `hasData` era
  calculado só a partir de `dre.data` (`rows.length > 0`), sem considerar
  `dre.isLoading` — enquanto a query ainda estava em voo, `dre.data` era
  `undefined`, e a tela tratava isso como "sem lançamentos"/"indisponível",
  idêntico ao resultado genuíno de um período vazio. Em produção, com
  latência real de rede, isso aparecia como um flash de "vazio" no primeiro
  carregamento; localmente a query resolve quase instantaneamente, por isso
  nunca reproduziu. Duas hipóteses anteriores (dessincronia `range`/
  `periodFilter.range`; prefetch SSR desatualizado) haviam sido descartadas
  com evidência antes desta — nenhuma delas era a causa. Corrigido em
  `dre.tsx` e `indicadores.tsx` (que usa a mesma `getDreData`): ambos agora
  mostram um estado de carregamento explícito enquanto `isLoading` for
  verdadeiro, e só tratam como "sem dados" quando `isLoading` for falso e
  `rows.length` for zero. Confirmado com simulação de latência real (delay
  de 2,5s injetado em `fetch` no browser + medição por polling de
  timestamps), cobrindo carregando/resolvido × dado real/vazio genuíno, em
  Bandrones e Grupo Erinho.
- **[Balanço Patrimonial, pendente de implementação]** Schema criado em
  24/09/2026 (`balance_accounts`, `balance_manual_entries`,
  `entries.balance_subgroup`) — ver migration
  `20260924181803_balanco-patrimonial-schema.sql`. Regra para validar no
  gate 5 quando a lógica de servidor for implementada:
  `balance_manual_entries.client_id` deve sempre ser derivado do
  `client_id` da `balance_accounts` referenciada por `account_id`, nunca
  aceito solto do formulário/payload do cliente — evita um usuário
  autorizado num cliente escrever `client_id` de outro cliente numa
  linha cujo `account_id` não bate.
- ~~41 lançamentos com sinal "invertido" (custo+, despesa+, receita_bruta−,
  receita_financeira−) no Grupo Erinho, investigados e NÃO são reversão~~
  **Reclassificado em 25-26/09/2026**, migration
  `20260926023216_reclassificacao-grupo-erinho-sinal-invertido.sql`. Investigação
  aprofundada (por CNPJ/CPF na `description`, não por texto do nome) revelou: 25
  lançamentos "ERINHO AUTO PECAS" (CNPJ 20678494000175) eram transferência
  interna confirmada → `nature='transferencia'` (exclui da DRE); 1 lançamento
  "REI DOS ENGATES" era custo real com conta/nature invertidos → `nature='custo'`,
  mantida conta CMV; 3 lançamentos de Lucas Gabriel Nogueira e os 4 lançamentos
  positivos (não os 7 negativos, que são CMV normal) de Lucas Gabriel Marques
  tinham classificação inconsistente/incerta → movidos para `status='pendente'`
  (revisão humana pendente); 2 lançamentos de Stephanny Myllene Carr, idem →
  `status='pendente'`; 5 lançamentos "TARIFA LIBERACAO CREDITO" (incl. variação
  "C60332668") estavam classificados como `receita_financeira` por uma regra
  genérica que capturava antes da regra específica e correta → reclassificados
  para `despesa_financeira`, conta "Antecipação de Recebíveis - Tarifas" (mesma
  regra já existente e correta no sistema, id
  `621e605f-7264-4eb8-8049-fe565f4ad4bc`). Os 3 lançamentos de Agiliza Transport
  (CNPJ 59766494000162) são reversão legítima confirmada de um fornecedor real —
  não foram tocados, ficam como o único caso de sinal "invertido" remanescente
  por design. Verificado ao vivo na DRE (não só SQL) de fevereiro e julho/2026:
  todos os totais batem exatamente com a reconciliação linha-a-linha feita antes
  da migration; Bandrones confirmado intacto nos 6 meses com dados.
- **Conflito de precedência de regras de classificação**, encontrado em
  25/09/2026 durante a investigação acima: o pattern genérico "LIBERACAO
  CREDITO" (regra ativa, `nature=receita_financeira`, conta "Antecipação de
  Recebíveis") capturava lançamentos de tarifa bancária antes da regra mais
  específica e correta "TARIFA LIBERACAO CREDITO" (`nature=despesa_financeira`,
  conta "Antecipação de Recebíveis - Tarifas", id
  `621e605f-7264-4eb8-8049-fe565f4ad4bc`, também ativa) conseguir aplicar. Os 5
  casos históricos já existentes foram corrigidos por reclassificação direta
  (ver nota acima), mas a causa raiz — o motor de matching em `classify.ts` não
  prioriza regras mais específicas sobre regras mais genéricas — não foi
  corrigida. Pode se repetir para lançamentos futuros com o mesmo padrão de
  texto. Requer revisão do critério de prioridade/especificidade no motor de
  regras antes que isso vire um problema recorrente.

## Ambiente / infraestrutura

- Banco: projeto Supabase próprio (não mais o Lovable Cloud). Variáveis de
  ambiente no Vercel: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (server-side)
  e `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (client-side) — os
  dois pares precisam ter os mesmos valores, só muda o prefixo. São lidas em
  **build time** (Vite), então qualquer mudança de variável exige um redeploy
  para valer.
- Auth: Supabase Auth. O **primeiro usuário criado** em um projeto Supabase
  novo vira admin automaticamente (trigger `handle_new_user`). Os seguintes
  viram `consultor` por padrão — acesso por cliente é controlado pela tabela
  `client_users`, liberado manualmente por um admin na aba Governança.
- Site URL / Redirect URLs do Supabase Auth precisam apontar para o domínio de
  produção real (Vercel), não para localhost nem para nenhum domínio de
  preview solto.
