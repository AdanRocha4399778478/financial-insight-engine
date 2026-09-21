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
