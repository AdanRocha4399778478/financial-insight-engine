# Importação de regras em lote (aba Governança)

Novo caminho para ensinar regras de classificação sem esperar um lançamento aparecer: subir uma planilha de regras, conferir a prévia e confirmar.

## Onde aparece

Na aba **Governança**, logo acima da lista "Regras aprendidas": um bloco "Importar regras em lote" com botão de envio de arquivo (XLSX/XLS/CSV), usando a mesma leitura de planilha já usada na importação de movimentações (detecção de cabeçalho, com escolha manual da linha quando não houver confiança).

## Fluxo

1. **Envio do arquivo** — leitura com o mesmo parser atual.
2. **Mapeamento de colunas** — sugestão automática por nome de coluna, ajustável em seletores:
   - Padrão (obrigatório)
   - Campo de correspondência (fornecedor / descrição) — se ausente, assume descrição
   - Conta gerencial (obrigatório)
   - Natureza (obrigatório)
   - Comportamento (fixo / variável)
   - Área (opcional)
   - Cliente (opcional — vazio = regra global)
3. **Prévia antes de confirmar**, mostrando:
   - total de linhas lidas, regras válidas, linhas descartadas e o motivo de cada descarte (padrão vazio, conta vazia, natureza inválida, comportamento inválido, cliente não encontrado)
   - primeiras linhas já normalizadas, para conferência visual
   - lista de **conflitos**: regras que já existem ativas com o mesmo cliente (ou global) + campo + padrão
   - duplicatas dentro do próprio arquivo: idênticas são consolidadas; divergentes viram erro e bloqueiam a linha
4. **Confirmação** — botão "Importar regras". Se houver conflitos, é exigida uma escolha explícita: "Sobrescrever regras existentes" (atualiza conta/natureza/comportamento/área) ou "Ignorar as conflitantes". Sem essa escolha, o botão fica bloqueado.
5. **Resultado** — aviso com criadas / atualizadas / ignoradas, e a lista de regras recarrega.

## Valores aceitos na planilha

- **Natureza**: aceita o código (`receita_bruta`, `deducao`, `custo`, `despesa`, `receita_financeira`, `despesa_financeira`, `outra_receita`, `outra_despesa`, `transferencia`, `excluido`) ou o rótulo em português já usado na tela ("Receita Bruta", "Dedução da Receita", ...). Comparação sem acento e sem diferenciar maiúsculas.
- **Comportamento**: `fixo` / `variavel` / "Fixo" / "Variável". Vazio vira "não definido".
- **Campo de correspondência**: `counterparty` / `description` ou "fornecedor" / "descrição".
- **Cliente**: nome do cliente exatamente como cadastrado (comparação sem acento/caixa) entre os clientes a que o consultor tem acesso. Vazio = regra global.

## Regras de negócio

- Toda regra criada por essa importação fica com `confirmed = true` e `active = true`, igual a uma regra criada na tela.
- Cada regra criada ou atualizada gera um registro de auditoria com origem `importacao_regras_lote` e `became_rule = true`, sem lançamento vinculado — mantendo separada a rastreabilidade de "veio de importação em lote" versus "confirmação humana lançamento a lançamento".
- Não há aplicação retroativa a lançamentos já existentes; o efeito vale para as próximas importações.
- Regras globais (sem cliente) só podem ser criadas por administradores — é a permissão que o banco já impõe hoje. Para consultores, essas linhas são recusadas com mensagem clara na prévia.

## Detalhes técnicos

- `src/lib/rules-file.ts` (novo): sugestão de mapeamento das colunas de regra, normalização/validação de linha, resolução dos enums, deduplicação interna do arquivo e montagem do resumo de prévia. Coberto por testes com vitest, no padrão de `parse-file.test.ts`.
- `src/lib/rules-import.functions.ts` (novo): server functions com `requireSupabaseAuth`:
  - `previewRulesImport` — revalida as linhas no servidor e retorna os conflitos com regras ativas existentes (consulta em `rules` por `client_id` + `match_field` + `pattern`).
  - `commitRulesImport` — insere as novas regras (`confirmed: true`, `created_by`), atualiza as conflitantes quando `overwrite` for pedido, e grava os registros em `classification_audit` com `entry_id: null`, `source: "importacao_regras_lote"`, `became_rule: true` (o `client_id` da auditoria é o cliente da aba de Governança, inclusive para regras globais).
- `src/routes/_authenticated/clientes.$clientId.governanca.tsx`: novo bloco de importação acima da seção existente, reutilizando `parseSpreadsheet` / `buildFromHeaderRow`, `listClients` para o seletor de clientes, e invalidação de `["rules", clientId]` e `["audit", clientId]` ao concluir.
- Sem alteração de schema, migrations ou RLS.
