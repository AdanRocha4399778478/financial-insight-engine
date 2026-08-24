import { counterpartyFromDescription } from "./classify";
import type { Behavior, Nature } from "./finance";
import type { TrainingInputRow } from "./training-import";

export interface BandronesTrainingRow {
  "Data"?: unknown;
  "Descrição"?: unknown;
  "Ramo Empresarial"?: unknown;
  "Valor"?: unknown;
  "Tipo"?: unknown;
  "Do que é esse gasto?"?: unknown;
  "Categoria"?: unknown;
}

export interface BandronesTrainingParseResult {
  rows: TrainingInputRow[];
  rejected: Array<{ sourceRowNumber: number; reason: string }>;
}

interface CategoryMapping {
  nature: Nature;
  behavior: Behavior;
}

/**
 * Tradução explícita do vocabulário histórico do Bandrones para o domínio
 * financeiro do produto. Nada aqui depende de data ou valor do lançamento.
 */
const CATEGORY_MAPPING: Record<string, CategoryMapping> = {
  "RECEITA BRUTA": { nature: "receita_bruta", behavior: "nao_aplicavel" },
  "TAXAS E IMPOSTOS SOBRE VENDA": { nature: "deducao", behavior: "variavel" },
  "CUSTO DE MERCADORIA VENDIDA": { nature: "custo", behavior: "variavel" },
  "DESPESAS FIXAS": { nature: "despesa", behavior: "fixo" },
  "DESPESAS VARIAVEIS": { nature: "despesa", behavior: "variavel" },
  "PRO LABORE": { nature: "despesa", behavior: "fixo" },
  "OUTRAS DESPESAS": { nature: "despesa", behavior: "nao_definido" },
  "EXCLUSO DRE": { nature: "excluido", behavior: "nao_aplicavel" },

  // O histórico não traz semântica suficiente para decidir se estes ajustes
  // são transferência, receita/despesa ou apenas acerto interno.
  "CREDITO DE AJUSTE DE CONTAS": { nature: "nao_definido", behavior: "nao_definido" },
  "DEBITO DE AJUSTE DE CONTAS": { nature: "nao_definido", behavior: "nao_definido" },
};

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeLabel(value: unknown): string {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  if (!valueText || valueText.toLowerCase() === "null") return null;
  return valueText;
}

export function bandronesCategoryMapping(category: unknown): CategoryMapping | null {
  return CATEGORY_MAPPING[normalizeLabel(category)] ?? null;
}

/**
 * Converte linhas já lidas do XLSX/CSV para o contrato interno de treinamento.
 * A numeração começa em 2 para refletir a linha real da planilha (linha 1 = cabeçalho).
 */
export function parseBandronesTrainingRows(
  sourceRows: BandronesTrainingRow[],
): BandronesTrainingParseResult {
  const result: BandronesTrainingParseResult = { rows: [], rejected: [] };

  sourceRows.forEach((source, index) => {
    const sourceRowNumber = index + 2;
    const description = text(source["Descrição"]);
    const account = text(source["Categoria"]);
    const mapping = bandronesCategoryMapping(account);

    if (!description) {
      result.rejected.push({ sourceRowNumber, reason: "missing_description" });
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

    const businessContext = nullableText(source["Ramo Empresarial"]);
    const expenseContext = nullableText(source["Do que é esse gasto?"]);

    result.rows.push({
      description,
      counterparty: counterpartyFromDescription(description),
      originalCategory: expenseContext ?? businessContext,
      account,
      nature: mapping.nature,
      behavior: mapping.behavior,
      area: null,
      sourceRowNumber,
    });
  });

  return result;
}
