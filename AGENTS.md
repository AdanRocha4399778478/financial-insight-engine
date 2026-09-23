<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

<!-- Nota do Adan (2026-09-22): projeto migrou o desenvolvimento para fora da Lovable
(Claude Code + Supabase próprio). O aviso acima pode estar desatualizado — confirmar
se este repositório ainda está de fato sincronizado com a Lovable antes de remover. -->

## GATE de Verificação

Este projeto classifica dados financeiros e gera DRE de clientes reais (Bandrones, Grupo Erinho, Medeiros). Um erro de classificação não gera exceção — gera um número errado entregue ao cliente. Por isso, nenhuma tarefa é considerada concluída pela leitura do código. Só é concluída depois de executada de verdade e verificada contra evidência.

Toda tarefa de desenvolvimento neste repositório segue os gates abaixo, em ordem. Se um gate falhar, a tarefa não avança: reporte o que falhou e por quê, não contorne silenciosamente.

### 1. Escopo autorizado
Antes de começar, confirme com Adan qual pendência aberta está sendo atacada e em que ordem, quando houver mais de uma pendência conhecida em aberto. Não escolha sozinho a prioridade entre pendências já mapeadas. Polimento visual (tema, espaçamento, cores, microcopy) nunca entra na frente de pendências de classificação/DRE pendentes sem autorização explícita.

### 2. Execução
Implemente a mudança dentro do escopo autorizado.

### 3. Validação estática
`npx tsc --noEmit` e `npx vitest run` precisam passar sem erro.
*(Ação pendente de setup: padronizar como scripts `typecheck` e `test` no `package.json` — hoje não existem, então cada sessão roda o comando manualmente e de forma inconsistente.)*

### 4. Validação de execução real
Para qualquer mudança que toque UI, fluxo de importação, classificação ou DRE: rode a aplicação de verdade, navegue até a tela afetada, leia o console/output de um carregamento limpo. Ler o código não substitui isso — foi exatamente a causa do bug de hidratação encontrado na implementação do tema (só apareceu rodando no navegador de verdade, não na leitura do código).

### 5. Validação de domínio
Para qualquer mudança em regras de classificação, importação ou DRE: confira o resultado contra pelo menos um caso conhecido do Bandrones ou do Grupo Erinho cujo resultado esperado Adan já validou manualmente. "Não quebrou nada" não é critério suficiente — o número tem que bater com o esperado.

### 6. Passou / não passou
Registre explicitamente o resultado de cada gate (3, 4, 5) antes de reportar a tarefa como concluída. Nenhuma etapa é presumida como passada por falta de erro visível.

### 7. Autorização explícita para push, merge, deploy e migration de produção
Nenhuma dessas ações acontece sem Adan confirmar, depois de ver o resultado dos gates 5 e 6 — inclusive para PRs de preview em branches que tocam classificação, importação ou DRE.

### 8. Correções diretas via migration (sem PR)

Correções pontuais de regra de classificação ou dado (não mudança de
código/schema de tabela) podem ser feitas direto contra produção via
`supabase migration new <nome>` + `supabase db push`, sem passar pelo
fluxo completo de PR — é um caminho legítimo para agilidade, já usado com
sucesso neste projeto. Mas três regras não são negociáveis:

1. **Sempre crie o arquivo de migration primeiro** (`supabase migration
   new`), nunca edite dado de produção direto pelo SQL Editor do
   dashboard sem gerar um arquivo correspondente.
2. **Commit e push do arquivo no mesmo dia, antes de encerrar a sessão.**
   Uma migration aplicada em produção sem o arquivo commitado no repositório
   não existe, para qualquer efeito prático — ninguém mais vai saber que
   aconteceu. Foi exatamente essa lacuna que gerou 35 migrations órfãs em
   22/09/2026, descobertas por acidente e cujo conteúdo original não pôde
   ser recuperado.
3. **Gate 5 (validação de domínio) continua valendo** — mesmo fora do
   fluxo de PR, confira o resultado contra um caso real antes de
   considerar a correção concluída.

Esse caminho é só para dado/regra. Mudança de schema (nova tabela, nova
coluna, política RLS) sempre passa pelo fluxo completo de PR com os gates
1–7.
