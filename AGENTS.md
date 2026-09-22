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
