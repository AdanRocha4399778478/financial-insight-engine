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
- **35 migrations aplicadas diretamente em produção entre 21/09 e 22/09
  (classificação/regras de Bandrones e Grupo Erinho) não têm arquivo
  correspondente neste repositório** — histórico de migrations local e
  remoto divergem. Descoberto em 22/09/2026 via
  `supabase migration list --project-ref snbstfomarqtcxzucdvh` durante o
  gate 7 do PR #4: as 3 migrations esperadas por este merge já estavam
  aplicadas, mas a listagem também mostrou 35 timestamps remotos (`local: ""`)
  sem arquivo local, de `2026-09-21 18:08:14` a `2026-09-22 03:16:30`.
  `supabase db pull` recusou puxar o diff por causa dessa divergência e
  sugeriu `supabase migration repair --status reverted <timestamp>` para
  cada uma das 35. **Reconciliar com `supabase migration repair` fica
  pendente de decisão explícita do Adan, não deve ser rodado sem
  autorização** — é uma ação que reescreve a tabela de controle de
  migrations em produção, não uma leitura.
- **Tela "Visão geral" mostrou dados zerados momentaneamente em produção**,
  notado em 22/09/2026 no recheque pós-deploy do PR #4: Visão geral do
  Bandrones mostrou 0 lançamentos/0 pendências momentaneamente em produção,
  logo após o deploy; Governança e DRE confirmaram dados corretos na
  sequência. Causa não identificada — pode ou não ser o mesmo bug de ciclo
  de vida já registrado na DRE. Investigar antes de confiar na Visão geral
  como fonte de verdade rápida.

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
