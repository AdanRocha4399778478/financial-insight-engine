import * as XLSX from "xlsx";
import { normalize } from "./classify";
import { STANDARD_FIELDS, type StandardField } from "./finance";

export interface ParsedFile {
  columns: string[];
  rows: Record<string, unknown>[];
  signature: string;
  matrix: unknown[][];
  headerRow: number;
  confident: boolean;
}

const HEADER_TOKENS = [
  "DATA",
  "DESCRICAO",
  "HISTORICO",
  "FORNECEDOR",
  "FAVORECIDO",
  "BENEFICIARIO",
  "CONTRAPARTE",
  "VALOR",
  "CREDITO",
  "DEBITO",
  "CATEGORIA",
  "DOCUMENTO",
  "CENTRO DE CUSTO",
  "CENTRO CUSTO",
  "TIPO",
  "SALDO",
  "LANCAMENTO",
  "MONTANTE",
];

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function scoreRow(row: unknown[]): number {
  const cells = row.map(cellText);
  const filled = cells.filter((c) => c !== "");
  if (filled.length < 2) return -1;
  let hits = 0;
  let numeric = 0;
  for (const cell of filled) {
    const n = normalize(cell);
    if (!n) continue;
    if (HEADER_TOKENS.some((t) => n === t || n.startsWith(t) || n.includes(t))) hits += 1;
    if (/^[\d.,\-R$/\s]+$/.test(cell)) numeric += 1;
  }
  if (hits === 0) return -1;
  return hits * 3 + filled.length * 0.2 - numeric * 2;
}

export function detectHeaderRow(matrix: unknown[][]): { index: number; confident: boolean } {
  const limit = Math.min(matrix.length, 25);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < limit; i += 1) {
    const score = scoreRow(matrix[i] ?? []);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0 || bestScore < 6) return { index: best < 0 ? 0 : best, confident: false };
  return { index: best, confident: true };
}

export function buildFromHeaderRow(matrix: unknown[][], headerRow: number): ParsedFile {
  const headerCells = matrix[headerRow] ?? [];
  const columns: string[] = [];
  const usedNames = new Set<string>();
  headerCells.forEach((cell, index) => {
    let name = cellText(cell) || `Coluna ${index + 1}`;
    while (usedNames.has(name)) name = `${name} (${index + 1})`;
    usedNames.add(name);
    columns[index] = name;
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = headerRow + 1; r < matrix.length; r += 1) {
    const line = matrix[r] ?? [];
    if (line.every((c) => cellText(c) === "")) continue;
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = line[i] ?? null;
    });
    rows.push(obj);
  }

  const signature = columns.map((c) => normalize(c)).sort().join("|");
  const detected = detectHeaderRow(matrix);
  return { columns, rows, signature, matrix, headerRow, confident: detected.confident };
}

export async function parseSpreadsheet(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Arquivo sem planilhas legíveis.");
  const sheet = wb.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
  if (!matrix.length) throw new Error("O arquivo não contém linhas de dados.");
  const detected = detectHeaderRow(matrix);
  return buildFromHeaderRow(matrix, detected.index);
}


const HINTS: Record<StandardField, string[]> = {
  entry_date: ["DATA", "DT", "DT MOVIMENTO", "DATA MOVIMENTO", "COMPETENCIA", "VENCIMENTO", "EMISSAO"],
  description: ["DESCRICAO", "HISTORICO", "OBSERVACAO", "MEMO", "LANCAMENTO"],
  counterparty: ["FORNECEDOR", "CONTRAPARTE", "CLIENTE", "FAVORECIDO", "BENEFICIARIO", "RAZAO SOCIAL"],
  amount: ["VALOR", "VL LANCAMENTO", "VL", "MONTANTE", "TOTAL"],
  credit: ["CREDITO", "ENTRADA", "RECEBIMENTO"],
  debit: ["DEBITO", "SAIDA", "PAGAMENTO"],
  original_category: ["CATEGORIA", "PLANO DE CONTAS", "CONTA", "CLASSIFICACAO"],
  cost_center: ["CENTRO DE CUSTO", "CC", "CENTRO CUSTO", "UNIDADE", "FILIAL"],
  document: ["DOCUMENTO", "NF", "NOTA", "DOC"],
  movement_type: ["TIPO", "SITUACAO", "NATUREZA", "OPERACAO"],
};

export function guessMapping(columns: string[]): Partial<Record<StandardField, string>> {
  const mapping: Partial<Record<StandardField, string>> = {};
  const used = new Set<string>();
  for (const field of STANDARD_FIELDS) {
    const hints = HINTS[field.key];
    const found = columns.find((col) => {
      if (used.has(col)) return false;
      const n = normalize(col);
      return hints.some((h) => n === h || n.startsWith(h) || n.includes(h));
    });
    if (found) {
      mapping[field.key] = found;
      used.add(found);
    }
  }
  return mapping;
}

export function parseNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  // Célula já numérica (raw do Excel): usar o valor bruto, sem parsing de string.
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return 0;

  let s = String(value).trim().replace(/[R$\s\u00a0]/gi, "");
  if (!s) return 0;
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-") || /-$/.test(s);
  s = s.replace(/[()]/g, "").replace(/-/g, "");
  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);

  let intPart = s;
  let decPart = "";
  if (lastSep >= 0) {
    const decimals = s.length - lastSep - 1;
    const onlyOneSep = s.indexOf(",") === lastComma && s.indexOf(".") === lastDot && lastComma * lastDot < 0;
    // Separador único com exatamente 3 dígitos após: milhar (ex.: "1.500" / "1,500").
    const isThousand = onlyOneSep && decimals === 3;
    if (!isThousand && decimals > 0 && decimals <= 3) {
      intPart = s.slice(0, lastSep);
      decPart = s.slice(lastSep + 1);
    }
  }

  const n = Number(`${intPart.replace(/[.,]/g, "") || "0"}${decPart ? `.${decPart}` : ""}`);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

export function parseDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (br) {
    const [, d, m, y] = br;
    const year = y!.length === 2 ? `20${y}` : y!;
    return `${year}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

export interface NormalizedRow {
  entry_date: string;
  description: string;
  counterparty: string | null;
  amount: number;
  movement_type: string | null;
  original_category: string | null;
  cost_center: string | null;
  document: string | null;
  raw: Record<string, unknown>;
}

export interface NormalizeSummary {
  read: number;
  valid: number;
  discarded: number;
  discardedNoMovement: number;
  discardedRepeatedHeader: number;
  discardedInvalid: number;
  creditCount: number;
  creditTotal: number;
  debitCount: number;
  debitTotal: number;
  net: number;
  balanceRows: { description: string; value: number }[];
}

/** Uma linha do conteúdo que repete os nomes de colunas do cabeçalho não é lançamento. */
export function isRepeatedHeader(row: Record<string, unknown>): boolean {
  const values = Object.values(row)
    .map((v) => (v === null || v === undefined ? "" : String(v).trim()))
    .filter((v) => v !== "");
  if (values.length < 2) return false;
  let hits = 0;
  for (const value of values) {
    const n = normalize(value);
    if (!n) continue;
    if (HEADER_TOKENS.some((t) => n === t)) hits += 1;
  }
  return hits >= 2 && hits >= Math.ceil(values.length / 2);
}

export function normalizeRows(
  rows: Record<string, unknown>[],
  mapping: Partial<Record<StandardField, string>>,
): { valid: NormalizedRow[]; invalid: number; summary: NormalizeSummary } {
  const valid: NormalizedRow[] = [];
  const summary: NormalizeSummary = {
    read: rows.length,
    valid: 0,
    discarded: 0,
    discardedNoMovement: 0,
    discardedRepeatedHeader: 0,
    discardedInvalid: 0,
    creditCount: 0,
    creditTotal: 0,
    debitCount: 0,
    debitTotal: 0,
    net: 0,
    balanceRows: [],
  };

  const pick = (row: Record<string, unknown>, field: StandardField) => {
    const col = mapping[field];
    return col ? row[col] : null;
  };

  for (const row of rows) {
    if (isRepeatedHeader(row)) {
      summary.discardedRepeatedHeader += 1;
      continue;
    }

    const date = parseDate(pick(row, "entry_date"));
    const description = String(pick(row, "description") ?? "").trim();

    const credit = mapping.credit ? parseNumber(pick(row, "credit")) : 0;
    const debit = mapping.debit ? parseNumber(pick(row, "debit")) : 0;
    const single = mapping.amount ? parseNumber(pick(row, "amount")) : 0;

    let amount = 0;
    if (credit !== 0 || debit !== 0) amount = credit !== 0 ? credit : -Math.abs(debit);
    else amount = single;

    // Regra principal: sem movimento financeiro (crédito, débito ou valor) não é lançamento.
    if (amount === 0) {
      summary.discardedNoMovement += 1;
      if (description) {
        const balance = parseNumber(row[Object.keys(row)[Object.keys(row).length - 1] ?? ""]);
        if (balance !== 0) summary.balanceRows.push({ description, value: balance });
      }
      continue;
    }

    if (!date) {
      summary.discardedInvalid += 1;
      continue;
    }

    const str = (f: StandardField) => {
      const v = pick(row, f);
      const s = v === null || v === undefined ? "" : String(v).trim();
      return s === "" ? null : s;
    };

    if (amount > 0) {
      summary.creditCount += 1;
      summary.creditTotal += amount;
    } else {
      summary.debitCount += 1;
      summary.debitTotal += Math.abs(amount);
    }

    valid.push({
      entry_date: date,
      description: description || "(sem descrição)",
      counterparty: str("counterparty"),
      amount,
      movement_type: str("movement_type"),
      original_category: str("original_category"),
      cost_center: str("cost_center"),
      document: str("document"),
      raw: row,
    });
  }

  summary.valid = valid.length;
  summary.discarded =
    summary.discardedNoMovement + summary.discardedRepeatedHeader + summary.discardedInvalid;
  summary.net = summary.creditTotal - summary.debitTotal;
  return { valid, invalid: summary.discarded, summary };
}

