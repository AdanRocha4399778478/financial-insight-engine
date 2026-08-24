# Financial Insight Engine

Especificação Funcional do MVP — Resultados Financeiros

1. Objetivo do produto

Criar uma aplicação financeira da Resultados S/A capaz de transformar arquivos financeiros de clientes em informação gerencial confiável com pouca intervenção manual.

O sistema deve reduzir a dependência de:

tratamento manual de planilhas;

Power Query;

Power BI;

conhecimento concentrado em uma única pessoa;

reconstrução recorrente de classificações já realizadas.

O fluxo oficial do MVP será:

Clientes → Importação → Classificação/Pendências → DRE → Indicadores

2. Critério principal de sucesso

O MVP é considerado validado quando um consultor consegue:

selecionar um cliente;

importar um novo arquivo financeiro;

mapear a estrutura do arquivo quando necessário;

deixar o sistema classificar o que já conhece;

resolver apenas os lançamentos incertos;

gerar uma DRE confiável;

analisar os principais indicadores;

rastrear qualquer valor até os lançamentos que o originaram;

sem precisar utilizar Power BI ou tratar manualmente a base fora da aplicação.

3. Usuários do MVP

Administrador Resultados

Pode:

cadastrar clientes;

configurar contexto financeiro;

revisar regras;

importar dados;

classificar lançamentos;

visualizar DRE;

visualizar indicadores;

corrigir classificações;

administrar regras aprendidas.

Consultor

Pode:

acessar os clientes autorizados;

importar dados;

resolver pendências;

visualizar DRE;

visualizar indicadores;

consultar lançamentos.

Cliente

Não é necessário no primeiro MVP.

O portal do cliente fica para uma fase posterior.

4. Módulo Clientes

Cada cliente precisa possuir um contexto próprio.

Dados básicos

nome;

nome fantasia;

ramo de atividade;

segmento;

modelo de receita;

status ativo/inativo.

Contexto financeiro

plano de contas aplicado;

estrutura gerencial;

centros de custo;

unidades;

filiais;

dimensões operacionais;

regras específicas de classificação.

Exemplos de dimensões:

Transportadora

veículo;

motorista;

rota;

unidade.

Varejo

filial;

vendedor;

categoria de produto.

Serviços

contrato;

projeto;

cliente final.

O sistema não deve obrigar todos os clientes a possuir as mesmas dimensões.

5. Módulo Importação

Formatos iniciais aceitos

MVP:

XLSX;

XLS;

CSV.

Não incluir inicialmente:

integração bancária automática;

API direta com ERP;

leitura genérica de PDF;

integração com todos os sistemas financeiros.

Fluxo

Usuário escolhe:

Cliente → Importar arquivo

O sistema lê o arquivo e identifica as colunas disponíveis.

Exemplos:

data;

descrição;

fornecedor;

histórico;

valor;

crédito;

débito;

categoria original;

centro de custo;

situação;

documento.

6. Mapeamento de colunas

Como diferentes sistemas possuem nomes diferentes, o importador precisa permitir:

Coluna do arquivo → Campo padrão Resultados

Exemplo:

ArquivoResultadosDt. movimentoDataHistóricoDescriçãoVl. lançamentoValorCategoriaCategoria originalFornecedorContraparte

Depois da primeira importação daquele formato, o sistema deve armazenar o mapeamento.

Próxima importação semelhante:

Estrutura reconhecida automaticamente.

7. Normalização

Depois da importação, os dados devem ser transformados para uma estrutura comum.

Todo lançamento deverá possuir, quando disponível:

cliente;

data;

descrição original;

fornecedor/contraparte;

valor;

tipo de movimento;

categoria original;

origem do arquivo;

referência da importação.

Nunca apagar a informação original.

A classificação Resultados será uma camada adicional.

8. Prevenção de duplicidade

O sistema precisa evitar importar novamente o mesmo lançamento.

Deve gerar uma identificação utilizando combinação de informações como:

cliente;

data;

valor;

descrição;

fornecedor;

origem.

Quando houver provável duplicidade:

"Este lançamento parece já ter sido importado."

O usuário poderá:

ignorar;

importar mesmo assim;

revisar.

9. Modelo financeiro multidimensional

Uma conta não deve possuir apenas uma categoria.

Cada lançamento poderá possuir diferentes atributos.

Natureza

Receita

Custo

Despesa

Resultado financeiro

Resultado não operacional

Transferência

Exclusão da DRE

Comportamento

Fixo

Variável

Misto

Não aplicável

Não definido

Área

Exemplos:

Operação

Comercial

Administrativo

Financeiro

Logística

Produção

Conta gerencial

Exemplos:

Combustível

Salários

Comissão

Energia

Frete

Material

Taxa de cartão

Manutenção

Dimensões

Variáveis conforme o cliente:

veículo;

unidade;

vendedor;

centro de custo;

projeto;

filial.

10. Contexto do ramo de atividade

O ramo do cliente influencia as sugestões, mas não decide sozinho a classificação.

Exemplo:

Combustível

Transportadora:

custo operacional normalmente variável.

Varejo:

pode ser despesa de veículos.

Empresa de serviços:

pode ser custo direto ou despesa, dependendo da operação.

Portanto, nenhuma regra de segmento deve substituir uma regra confirmada especificamente para aquele cliente.

11. Motor de classificação

Ordem de prioridade:

regra confirmada do cliente;

histórico de classificação daquele cliente;

regra específica do segmento;

regra geral Resultados;

correspondência por fornecedor;

correspondência por descrição;

sugestão por IA;

confirmação humana.

A IA deve ser apoio, não autoridade final.

12. Sistema de confiança

Cada classificação deverá receber um nível de confiança.

Alta confiança

Pode classificar automaticamente.

Exemplo:

Fornecedor reconhecido por regra confirmada anteriormente.

Média confiança

Sistema sugere.

Usuário confirma ou altera.

Baixa confiança

Vai para pendência.

Nenhuma classificação financeira crítica deve ser ocultamente inventada.

13. Aprendizado

Quando o usuário corrige ou confirma uma classificação, o sistema deve permitir transformar essa decisão em regra.

Exemplo:

Descrição

AUTO POSTO AVIADOR

Conta

Combustível

Natureza

Custo

Comportamento

Variável

Área

Operação

Regra

Aplicar automaticamente a lançamentos futuros semelhantes deste cliente.

O aprendizado deve ser auditável.

14. Tela Classificação/Pendências

A tela deve priorizar exceções.

Topo:

total importado;

classificados automaticamente;

aguardando confirmação;

não classificados;

percentual de classificação.

Exemplo:

1.284 lançamentos

1.146 automáticos

102 sugeridos

36 pendentes

97,2% classificados

Tabela

Mostrar:

data;

descrição;

fornecedor;

valor;

categoria original;

conta sugerida;

confiança;

status.

Ações rápidas:

confirmar;

alterar;

aplicar mesma regra aos semelhantes;

ignorar da DRE.

15. Classificação em lote

O sistema deve permitir selecionar vários lançamentos semelhantes.

Exemplo:

15 lançamentos contendo:

AUTO POSTO AVIADOR

Usuário classifica todos como:

Combustível

e opcionalmente cria regra futura.

Isso é necessário para gerar ganho operacional real.

16. Estrutura gerencial da DRE

Modelo inicial:

Receita

Receita Bruta

Deduções

Receita Líquida

Custos

Custos Variáveis

Custos Fixos

Custos Mistos

Despesas

Despesas Variáveis

Despesas Fixas

Despesas Mistas

Resultados intermediários

Margem Bruta

Margem de Contribuição

EBITDA

Resultado financeiro

Receitas Financeiras

Despesas Financeiras

Resultado não operacional

Outras Receitas

Outras Despesas

Resultado líquido

A estrutura poderá evoluir sem alterar o lançamento original.

17. Tela DRE

Filtros:

cliente;

período;

ano;

mês;

unidade/dimensão quando disponível.

Visualizações:

Demonstrativo

Apresentar valores hierarquicamente.

Exemplo:

Receita Bruta
Deduções
Receita Líquida
Custos
Margem Bruta
Despesas Variáveis
Margem de Contribuição
Estrutura fixa
EBITDA
Resultado Financeiro
Resultado Líquido

Comparação

Permitir:

mês atual x mês anterior;

mês atual x mesmo mês do ano anterior;

acumulado atual x acumulado anterior.

18. Drill-down

Todo valor agregado precisa ser rastreável.

Exemplo:

Custos Operacionais
R$ 83.420

↓

Combustível
R$ 41.300

↓

Lista dos lançamentos.

Isso é obrigatório para confiança no sistema.

19. Indicadores do MVP

Mostrar:

Receita Bruta;

Receita Líquida;

Margem Bruta;

Margem de Contribuição;

EBITDA;

Margem Líquida;

Resultado Líquido;

Ponto de Equilíbrio;

Margem de Segurança.

Não implementar inicialmente:

ROE;

ROA;

liquidez;

dívida líquida/EBITDA;

grau de endividamento;

capital de giro.

Esses indicadores dependem do balanço.

20. Qualidade dos indicadores

O sistema não deve mostrar indicador inválido como se fosse correto.

Exemplo:

Em vez de:

Liquidez: 0

mostrar:

Indicador não disponível

Motivo:

Dados insuficientes para cálculo.

Para divisões problemáticas:

Indicador não aplicável para o período.

21. Auditoria

Toda classificação precisa registrar:

quem classificou;

quando;

classificação anterior;

classificação nova;

origem da decisão;

se virou regra;

nível de confiança.

Isso permitirá corrigir problemas sem perder histórico.

22. Importações

Cada upload deve possuir um registro próprio.

Exemplo:

Importação

Maxipar
Julho/2026
Arquivo: financeiro_julho.xlsx
1.842 lançamentos
1.801 válidos
41 pendentes

Isso permitirá rastreabilidade e eventual exclusão controlada de uma carga.

23. Fora do MVP

Não construir agora:

DFC completa;

Balanço Patrimonial;

consolidação de empresas;

orçamento;

forecast;

valuation;

conciliação bancária;

API ERP;

Open Finance;

portal do cliente;

aplicativo móvel;

controle financeiro transacional;

contas a pagar;

contas a receber.

O sistema é inicialmente uma plataforma de análise, não um ERP.

24. Critérios de aceite

Teste A — Importação

Arquivo financeiro válido é carregado e convertido para o modelo Resultados.

Teste B — Aprendizado

Classificação confirmada gera regra e é reaplicada em importação posterior.

Teste C — Pendências

Lançamentos incertos não são classificados silenciosamente.

Teste D — DRE

DRE é calculada somente com base validada.

Teste E — Rastreabilidade

Usuário consegue navegar do resultado até o lançamento original.

Teste F — Reprocessamento

Correção de uma classificação atualiza automaticamente a DRE.

Teste G — Segurança

Um usuário não acessa clientes para os quais não possui permissão.

25. Métricas de sucesso do produto

Medir:

Taxa de classificação automática

Percentual de lançamentos que não precisam de intervenção.

Tempo para fechar uma DRE

Tempo entre upload e DRE validada.

Pendências por importação

Número absoluto e percentual.

Regras reutilizadas

Quanto do aprendizado anterior foi aproveitado.

Correções de classificações automáticas

Indicador de qualidade do motor.

A principal métrica operacional é:

tempo necessário para transformar arquivo financeiro em DRE validada.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f761cf8e-f433-402c-b8e0-bea15d9e7908).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
