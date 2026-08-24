import { normalize } from "./classify";
import { parseNumber } from "./parse-file";
import type { ParsedFile } from "./parse-file";

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEV: 2,
  MAR: 3,
  ABR: 4,
  MAI: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SET: 9,
  OUT: 10,
  NOV: 11,
  DEZ: 12,
};

const DERIVED_TOKENS = ["TOTAL", "MEDIA", "ACUMULADO", "AV", "AH", "VARIACAO"];

/** "Mai/2026", "05/2026", "2026-05", "Maio 2026" -> "2026-05-01". */
export function parsePeriodColumn(name: string): { period: string; label: string } | null {
  const raw = String(name ?? "").trim();
  if (!raw) return null;
  if (raw.includes("%")) return null;
  const n = normalize(raw);
  if (!n) return null;
  if (DERIVED_TOKENS.some((t) => n === t || n.startsWith(`${t} `) || n.includes(` ${t}`))) return null;

  const iso = raw.match(/(20\d{2})[-/](\d{1,2})$/);
  if (iso) return { period: `${iso[1]}-${iso[2]!.padStart(2, "0")}-01`, label: raw };

  const numeric = raw.match(/^(\d{1,2})[-/](20\d{2})$/);
  if (numeric) {
    const m = Number(numeric[1]);
    if (m >= 1 && m <= 12)
      return { period: `${numeric[2]}-${String(m).padStart(2, "0")}-01`, label: raw };
  }

  const named = n.match(/^([A-Z]{3})[A-Z]*\s*[\/\-\s]?\s*(\d{2,4})$/);
  if (named) {
    const month = MONTHS[named[1]!];
    if (month) {
      const y = named[2]!.length === 2 ? `20${named[2]}` : named[2]!;
      return { period: `${y}-${String(month).padStart(2, "0")}-01`, label: raw };
    }
  }
  return null;
}

export interface DrePeriodColumn {
  column: string;
  period: string;
  label: string;
}

export interface DreStructure {
  codeColumn: string | null;
  nameColumn: string | null;
  periods: DrePeriodColumn[];
  ignored: string[];
}

export function detectDreStructure(parsed: ParsedFile): DreStructure {
  const periods: DrePeriodColumn[] = [];
  const ignored: string[] = [];
  let codeColumn: string | null = null;
  let nameColumn: string | null = null;

  for (const col of parsed.columns) {
    const n = normalize(col);
    const period = parsePeriodColumn(col);
    if (period) {
      periods.push({ column: col, period: period.period, label: period.label });
      continue;
    }
    if (!codeColumn && (n === "CONTA" || n.includes("CODIGO") || n === "COD" || n.includes("COD CONTA"))) {
      codeColumn = col;
      continue;
    }
    if (!nameColumn && (n.includes("NOME") || n.includes("DESCRICAO") || n.includes("HISTORICO"))) {
      nameColumn = col;
      continue;
    }
    ignored.push(col);
  }

  if (!codeColumn && parsed.columns[0]) codeColumn = parsed.columns[0];
  if (!nameColumn && parsed.columns[1] && parsed.columns[1] !== codeColumn)
    nameColumn = parsed.columns[1];

  periods.sort((a, b) => a.period.localeCompare(b.period));
  return { codeColumn, nameColumn, periods, ignored };
}

export interface DreFactRow {
  account_code: string;
  account_name: string;
  period: string;
  period_label: string;
  amount: number;
}

export interface DreParseResult {
  facts: DreFactRow[];
  accounts: { code: string; name: string }[];
  skipped: number;
}

export function buildDreFacts(
  rows: Record<string, unknown>[],
  structure: DreStructure,
): DreParseResult {
  const facts: DreFactRow[] = [];
  const accounts = new Map<string, string>();
  let skipped = 0;

  for (const row of rows) {
    const code = String(structure.codeColumn ? (row[structure.codeColumn] ?? "") : "").trim();
    const name = String(structure.nameColumn ? (row[structure.nameColumn] ?? "") : "").trim();
    if (!code && !name) {
      skipped += 1;
      continue;
    }
    const key = code || name;
    let any = false;
    for (const p of structure.periods) {
      const amount = parseNumber(row[p.column]);
      if (amount === 0) continue;
      any = true;
      facts.push({
        account_code: key.slice(0, 60),
        account_name: (name || code).slice(0, 200),
        period: p.period,
        period_label: p.label.slice(0, 40),
        amount,
      });
    }
    if (any) accounts.set(key.slice(0, 60), (name || code).slice(0, 200));
    else skipped += 1;
  }

  return {
    facts,
    accounts: [...accounts.entries()].map(([code, name]) => ({ code, name })),
    skipped,
  };
}
