import * as XLSX from "xlsx";
import { normalize } from "./classify";
import { STANDARD_FIELDS, type StandardField } from "./finance";

export interface ParsedFile {
  columns: string[];
  rows: Record<string, unknown>[];
  signature: string;
}

export async function parseSpreadsheet(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Arquivo sem planilhas legíveis.");
  const sheet = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
  const columns = rows.length ? Object.keys(rows[0]!) : [];
  const signature = columns.map((c) => normalize(c)).sort().join("|");
  return { columns, rows, signature };
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
  if (typeof value === "number") return value;
  let s = String(value).trim().replace(/[R$\s]/g, "");
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()\-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s.replace(/[^0-9.]/g, ""));
  if (Number.isNaN(n)) return 0;
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

export function normalizeRows(
  rows: Record<string, unknown>[],
  mapping: Partial<Record<StandardField, string>>,
): { valid: NormalizedRow[]; invalid: number } {
  const valid: NormalizedRow[] = [];
  let invalid = 0;
  const pick = (row: Record<string, unknown>, field: StandardField) => {
    const col = mapping[field];
    return col ? row[col] : null;
  };

  for (const row of rows) {
    const date = parseDate(pick(row, "entry_date"));
    let amount = parseNumber(pick(row, "amount"));
    if (!mapping.amount) {
      const credit = parseNumber(pick(row, "credit"));
      const debit = parseNumber(pick(row, "debit"));
      amount = credit !== 0 ? credit : -Math.abs(debit);
    }
    const description = String(pick(row, "description") ?? "").trim();
    if (!date || (!description && amount === 0)) {
      invalid += 1;
      continue;
    }
    const str = (f: StandardField) => {
      const v = pick(row, f);
      const s = v === null || v === undefined ? "" : String(v).trim();
      return s === "" ? null : s;
    };
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
  return { valid, invalid };
}
