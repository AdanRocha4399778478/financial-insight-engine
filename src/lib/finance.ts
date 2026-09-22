export type Nature =
  | "receita_bruta"
  | "deducao"
  | "custo"
  | "despesa"
  | "receita_financeira"
  | "despesa_financeira"
  | "outra_receita"
  | "outra_despesa"
  | "transferencia"
  | "excluido"
  | "nao_definido";

export type Behavior = "fixo" | "variavel" | "misto" | "nao_aplicavel" | "nao_definido";
export type EntryStatus = "auto" | "sugerido" | "pendente" | "confirmado" | "ignorado";

export const NATURE_LABEL: Record<Nature, string> = {
  receita_bruta: "Receita Bruta",
  deducao: "Dedução da Receita",
  custo: "Custo",
  despesa: "Despesa",
  receita_financeira: "Receita Financeira",
  despesa_financeira: "Despesa Financeira",
  outra_receita: "Outra Receita",
  outra_despesa: "Outra Despesa",
  transferencia: "Transferência",
  excluido: "Excluído da DRE",
  nao_definido: "Não definido",
};

export const BEHAVIOR_LABEL: Record<Behavior, string> = {
  fixo: "Fixo",
  variavel: "Variável",
  misto: "Misto",
  nao_aplicavel: "Não aplicável",
  nao_definido: "Não definido",
};

export const STATUS_LABEL: Record<EntryStatus, string> = {
  auto: "Classificado automaticamente",
  sugerido: "Sugerido",
  pendente: "Pendente",
  confirmado: "Confirmado",
  ignorado: "Ignorado da DRE",
};

export const AREAS = [
  "Operação",
  "Comercial",
  "Administrativo",
  "Financeiro",
  "Logística",
  "Produção",
];

export const NATURES = Object.keys(NATURE_LABEL) as Nature[];
export const BEHAVIORS = Object.keys(BEHAVIOR_LABEL) as Behavior[];

export const STANDARD_FIELDS = [
  { key: "entry_date", label: "Data", required: true },
  { key: "description", label: "Descrição", required: true },
  { key: "counterparty", label: "Fornecedor / Contraparte", required: false },
  { key: "amount", label: "Valor", required: true },
  { key: "credit", label: "Crédito", required: false },
  { key: "debit", label: "Débito", required: false },
  { key: "balance", label: "Saldo", required: false },
  { key: "original_category", label: "Categoria original", required: false },
  { key: "cost_center", label: "Centro de custo", required: false },
  { key: "document", label: "Documento", required: false },
  { key: "movement_type", label: "Tipo de movimento", required: false },
] as const;

export type StandardField = (typeof STANDARD_FIELDS)[number]["key"];

export interface DreRow {
  nature: Nature;
  behavior: Behavior;
  amount: number;
  account: string | null;
  excluded_from_dre?: boolean;
  status?: EntryStatus;
}

export interface DreResult {
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custosVariaveis: number;
  custosFixos: number;
  custosMistos: number;
  custosTotal: number;
  margemBruta: number;
  despesasVariaveis: number;
  despesasFixas: number;
  despesasMistas: number;
  despesasTotal: number;
  margemContribuicao: number;
  ebitda: number;
  receitasFinanceiras: number;
  despesasFinanceiras: number;
  resultadoFinanceiro: number;
  outrasReceitas: number;
  outrasDespesas: number;
  resultadoNaoOperacional: number;
  resultadoLiquido: number;
  estruturaFixa: number;
  byAccount: Record<string, { account: string; nature: Nature; total: number; count: number }>;
}

const abs = (v: number) => Math.abs(Number(v) || 0);

export function buildDre(rows: DreRow[]): DreResult {
  const r: DreResult = {
    receitaBruta: 0,
    deducoes: 0,
    receitaLiquida: 0,
    custosVariaveis: 0,
    custosFixos: 0,
    custosMistos: 0,
    custosTotal: 0,
    margemBruta: 0,
    despesasVariaveis: 0,
    despesasFixas: 0,
    despesasMistas: 0,
    despesasTotal: 0,
    margemContribuicao: 0,
    ebitda: 0,
    receitasFinanceiras: 0,
    despesasFinanceiras: 0,
    resultadoFinanceiro: 0,
    outrasReceitas: 0,
    outrasDespesas: 0,
    resultadoNaoOperacional: 0,
    resultadoLiquido: 0,
    estruturaFixa: 0,
    byAccount: {},
  };

  for (const row of rows) {
    if (row.excluded_from_dre) continue;
    if (row.nature === "transferencia" || row.nature === "excluido" || row.nature === "nao_definido")
      continue;
    const v = abs(row.amount);
    const key = `${row.nature}::${row.account ?? "Sem conta"}`;
    const bucket = r.byAccount[key] ?? {
      account: row.account ?? "Sem conta",
      nature: row.nature,
      total: 0,
      count: 0,
    };
    bucket.total += v;
    bucket.count += 1;
    r.byAccount[key] = bucket;

    switch (row.nature) {
      case "receita_bruta":
        r.receitaBruta += v;
        break;
      case "deducao":
        r.deducoes += v;
        break;
      case "custo":
        if (row.behavior === "variavel") r.custosVariaveis += v;
        else if (row.behavior === "fixo") r.custosFixos += v;
        else r.custosMistos += v;
        break;
      case "despesa":
        if (row.behavior === "variavel") r.despesasVariaveis += v;
        else if (row.behavior === "fixo") r.despesasFixas += v;
        else r.despesasMistas += v;
        break;
      case "receita_financeira":
        r.receitasFinanceiras += v;
        break;
      case "despesa_financeira":
        r.despesasFinanceiras += v;
        break;
      case "outra_receita":
        r.outrasReceitas += v;
        break;
      case "outra_despesa":
        r.outrasDespesas += v;
        break;
    }
  }

  r.receitaLiquida = r.receitaBruta - r.deducoes;
  r.custosTotal = r.custosVariaveis + r.custosFixos + r.custosMistos;
  r.margemBruta = r.receitaLiquida - r.custosTotal;
  r.despesasTotal = r.despesasVariaveis + r.despesasFixas + r.despesasMistas;
  r.margemContribuicao = r.receitaLiquida - r.custosVariaveis - r.despesasVariaveis;
  r.estruturaFixa = r.custosFixos + r.custosMistos + r.despesasFixas + r.despesasMistas;
  r.ebitda = r.margemContribuicao - r.estruturaFixa;
  r.resultadoFinanceiro = r.receitasFinanceiras - r.despesasFinanceiras;
  r.resultadoNaoOperacional = r.outrasReceitas - r.outrasDespesas;
  r.resultadoLiquido = r.ebitda + r.resultadoFinanceiro + r.resultadoNaoOperacional;
  return r;
}

export interface Indicator {
  key: string;
  label: string;
  value: number | null;
  format: "currency" | "percent";
  reason?: string | undefined;
  hint?: string | undefined;
}

export function buildIndicators(d: DreResult, hasData: boolean): Indicator[] {
  const unavailable = (key: string, label: string, format: Indicator["format"], reason: string) => ({
    key,
    label,
    value: null,
    format,
    reason,
  });

  if (!hasData) {
    return [
      "Receita Bruta",
      "Receita Líquida",
      "Margem Bruta",
      "Margem de Contribuição",
      "EBITDA",
      "Margem Líquida",
      "Resultado Líquido",
      "Ponto de Equilíbrio",
      "Margem de Segurança",
    ].map((label) =>
      unavailable(label, label, "currency", "Dados insuficientes para cálculo."),
    );
  }

  const rl = d.receitaLiquida;
  const mcIndex = rl > 0 ? d.margemContribuicao / rl : null;
  const pe = mcIndex && mcIndex > 0 ? d.estruturaFixa / mcIndex : null;

  return [
    { key: "rb", label: "Receita Bruta", value: d.receitaBruta, format: "currency" },
    { key: "rlq", label: "Receita Líquida", value: rl, format: "currency" },
    {
      key: "mb",
      label: "Margem Bruta",
      value: d.margemBruta,
      format: "currency",
      hint: rl > 0 ? `${((d.margemBruta / rl) * 100).toFixed(1)}% da receita líquida` : undefined,
    },
    {
      key: "mc",
      label: "Margem de Contribuição",
      value: d.margemContribuicao,
      format: "currency",
      hint: mcIndex !== null ? `Índice MC ${(mcIndex * 100).toFixed(1)}%` : undefined,
    },
    { key: "ebitda", label: "EBITDA", value: d.ebitda, format: "currency" },
    rl > 0
      ? {
          key: "ml",
          label: "Margem Líquida",
          value: (d.resultadoLiquido / rl) * 100,
          format: "percent" as const,
        }
      : unavailable("ml", "Margem Líquida", "percent", "Receita líquida igual a zero no período."),
    { key: "rliq", label: "Resultado Líquido", value: d.resultadoLiquido, format: "currency" },
    pe !== null
      ? { key: "pe", label: "Ponto de Equilíbrio", value: pe, format: "currency" as const }
      : unavailable(
          "pe",
          "Ponto de Equilíbrio",
          "currency",
          "Margem de contribuição não positiva no período.",
        ),
    pe !== null && rl > 0
      ? {
          key: "ms",
          label: "Margem de Segurança",
          value: ((rl - pe) / rl) * 100,
          format: "percent" as const,
        }
      : unavailable(
          "ms",
          "Margem de Segurança",
          "percent",
          "Depende do ponto de equilíbrio e da receita do período.",
        ),
  ];
}

export const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const pct = (v: number) => `${v.toFixed(1)}%`;

export const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-");
  const names = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];
  return `${names[Number(m) - 1] ?? m}/${y}`;
};
