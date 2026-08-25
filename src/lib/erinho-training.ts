import { counterpartyFromDescription, normalize } from "./classify";
import type { Behavior, Nature } from "./finance";
import type { TrainingInputRow } from "./training-import";

export interface ErinhoTrainingRow {
  "Categoria"?: unknown;
  "Descrição"?: unknown;
  "Descrição Detalhada"?: unknown;
  "Valor"?: unknown;
  "Data"?: unknown;
  "C/D"?: unknown;
  "Banco"?: unknown;
  "Documento"?: unknown;
  "Observação"?: unknown;
  "Ramo Empresarial"?: unknown;
  "Do que é esse gasto?"?: unknown;
}

export interface ErinhoTrainingWarning {
  sourceRowNumber: number;
  code: "financing_flow" | "interaccount_transfer" | "financial_charge";
  account: string;
  description: string;
  detailedDescription: string | null;
  reason: string;
}

export interface ErinhoTrainingParseResult {
  rows: TrainingInputRow[];
  rejected: Array<{ sourceRowNumber: number; reason: string }>;
  warnings: ErinhoTrainingWarning[];
}

interface CategoryMapping {
  nature: Nature;
  behavior: Behavior;
}

const CATEGORY_MAPPING: Record<string, CategoryMapping> = {
  "RECEITA BRUTA": { nature: "receita_bruta", behavior: "nao_aplicavel" },
  "TAXAS E IMPOSTOS SOBRE VENDA": { nature: "deducao", behavior: "variavel" },
  "CMV": { nature: "custo", behavior: "variavel" },
  "CUSTO DE MERCADORIA VENDIDA": { nature: "custo", behavior: "variavel" },
  "DESPESAS FIXAS": { nature: "despesa", behavior: "fixo" },
  "DESPESAS VARIAVEIS": { nature: "despesa", behavior: "variavel" },
  "PRO LABORE": { nature: "despesa", behavior: "fixo" },
  "OUTRAS DESPESAS": { nature: "outra_despesa", behavior: "nao_definido" },
  "DESPESA FINANCEIRA": { nature: "despesa_financeira", behavior: "nao_aplicavel" },
  "JUROS FINANCEIROS": { nature: "despesa_financeira", behavior: "nao_aplicavel" },
  "OUTRAS RECEITAS": { nature: "outra_receita", behavior: "nao_aplicavel" },
  "EXCLUSO DRE": { nature: "excluido", behavior: "nao_aplicavel" },
  "AMORTIZACAO E DEPRECIACAO": { nature: "outra_despesa", behavior: "nao_aplicavel" },
};

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  const valueText = String(value).trim();
  return valueText.toLowerCase() === "null" ? "" : valueText;
}

function normalizeLabel(value: unknown): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericDetailed(value: string): boolean {
  if (!value) return true;
  const normalized = normalizeLabel(value);
  return [
    "LIQUIDACAO DE PARCELA",
    "TARIFA COBRANCA",
    "DEBITO REFERENTE A TARIFAS BANCARIAS SOBRE SERVICOS DE COBRANCA.",
    "DEBITO REFERENTE AO PAGAMENTO DE TITULOS OU COMPROMISSOS FINANCEIROS.",
    "IOF ADICIONAL PJ",
    "IOF S/ OPER. CREDITO PJ",
  ].includes(normalized);
}

function directionPrefix(source: ErinhoTrainingRow): "PIX ENVIADO DES:" | "PIX RECEBIDO REM:" {
  const cd = normalizeLabel(source["C/D"]);
  if (cd === "CREDITO") return "PIX RECEBIDO REM:";
  return "PIX ENVIADO DES:";
}

function identityDescription(source: ErinhoTrainingRow): { description: string; counterparty: string | null } | null {
  const description = text(source["Descrição"]);
  const detailed = text(source["Descrição Detalhada"]);

  const embedded = counterpartyFromDescription(description);
  if (embedded) return { description, counterparty: embedded };

  if (detailed && !isGenericDetailed(detailed)) {
    const synthetic = `${directionPrefix(source)} ${detailed}`;
    return { description: synthetic, counterparty: detailed };
  }

  if (description) return { description, counterparty: null };
  return null;
}

function semanticWarning(
  source: ErinhoTrainingRow,
  sourceRowNumber: number,
  account: string,
  mapping: CategoryMapping,
): ErinhoTrainingWarning | null {
  const description = text(source["Descrição"]);
  const detailedDescription = text(source["Descrição Detalhada"]) || null;
  const haystack = normalize(`${description} ${detailedDescription ?? ""}`);

  const isFinancialCharge = /\b(IOF|JUROS|TARIFA|ENCARGO|MULTA)\b/.test(haystack);
  if (isFinancialCharge) {
    if (!["despesa_financeira", "excluido"].includes(mapping.nature)) {
      return {
        sourceRowNumber,
        code: "financial_charge",
        account,
        description,
        detailedDescription,
        reason:
          "Encargo financeiro identificado, mas a categoria histórica não está como despesa financeira ou excluída. Revisar antes de ensinar o padrão.",
      };
    }
    return null;
  }

  if (/\b(TRANSF ENTRE CONTAS|TRANSFERENCIA ENTRE CONTAS|TRANSF INTERNA|TRANSFERENCIA INTERNA)\b/.test(haystack)) {
    if (!["excluido", "transferencia"].includes(mapping.nature)) {
      return {
        sourceRowNumber,
        code: "interaccount_transfer",
        account,
        description,
        detailedDescription,
        reason:
          "Transferência entre contas detectada. Esse movimento tende a não compor a DRE e merece revisão antes de virar conhecimento automático.",
      };
    }
  }

  if (/\b(LIBERACAO CREDITO|EMPRESTIMO|FINANCIAMENTO|AMORTIZACAO)\b/.test(haystack)) {
    if (!["excluido", "transferencia"].includes(mapping.nature)) {
      return {
        sourceRowNumber,
        code: "financing_flow",
        account,
        description,
        detailedDescription,
        reason:
          "Fluxo do principal de financiamento identificado. O valor recebido ou amortizado normalmente não pertence ao resultado; revisar antes de ensinar a classificação.",
      };
    }
  }

  return null;
}

export function erinhoCategoryMapping(category: unknown): CategoryMapping | null {
  return CATEGORY_MAPPING[normalizeLabel(category)] ?? null;
}

/**
 * Adapter conservador para os históricos do Grupo Erinho.
 *
 * A Descrição Detalhada é usada como identidade quando carrega contraparte útil.
 * Descrições detalhadas genéricas continuam como contexto e não são promovidas
 * artificialmente a fornecedor. Categorias sem semântica segura são rejeitadas.
 * Linhas com risco contábil/financeiro são apenas sinalizadas para revisão: o
 * adapter não corrige silenciosamente o histórico do cliente.
 */
export function parseErinhoTrainingRows(sourceRows: ErinhoTrainingRow[]): ErinhoTrainingParseResult {
  const result: ErinhoTrainingParseResult = { rows: [], rejected: [], warnings: [] };

  sourceRows.forEach((source, index) => {
    const sourceRowNumber = index + 2;
    const account = text(source["Categoria"]);
    const mapping = erinhoCategoryMapping(account);
    const identity = identityDescription(source);

    if (!identity) {
      result.rejected.push({ sourceRowNumber, reason: "missing_identity" });
      return;
    }
    if (!account) {
      result.rejected.push({ sourceRowNumber, reason: "missing_category" });
      return;
    }
    if (!mapping) {
      result.rejected.push({ sourceRowNumber, reason: `unknown_category:${account}` });
      return;
    }

    const warning = semanticWarning(source, sourceRowNumber, account, mapping);
    if (warning) result.warnings.push(warning);

    const businessContext = text(source["Ramo Empresarial"]);
    const expenseContext = text(source["Do que é esse gasto?"]);

    result.rows.push({
      description: identity.description,
      counterparty: identity.counterparty,
      originalCategory: expenseContext || businessContext || null,
      account,
      nature: mapping.nature,
      behavior: mapping.behavior,
      area: null,
      sourceRowNumber,
      diagnostics: {
        rawDescription: text(source["Descrição"]) || null,
        rawDetailedDescription: text(source["Descrição Detalhada"]) || null,
        rawDirection: text(source["C/D"]) || null,
      },
    });
  });

  return result;
}
