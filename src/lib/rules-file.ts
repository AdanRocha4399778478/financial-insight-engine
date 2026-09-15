import { normalize } from "./classify";
import { BEHAVIOR_LABEL, NATURE_LABEL, type Behavior, type Nature } from "./finance";

export const RULE_FIELDS = [
  { key: "pattern", label: "Padrão", required: true },
  { key: "match_field", label: "Campo de correspondência", required: false },
  { key: "account", label: "Conta gerencial", required: true },
  { key: "nature", label: "Natureza", required: true },
  { key: "behavior", label: "Comportamento", required: false },
  { key: "area", label: "Área", required: false },
  { key: "client", label: "Cliente (vazio = global)", required: false },
] as const;

export type RuleField = (typeof RULE_FIELDS)[number]["key"];

const HINTS: Record<RuleField, string[]> = {
  pattern: ["PADRAO", "PATTERN", "TEXTO", "TERMO", "CHAVE"],
  match_field: ["CAMPO", "MATCH FIELD", "MATCH_FIELD", "CORRESPONDENCIA", "ONDE"],
  account: ["CONTA", "CONTA GERENCIAL", "ACCOUNT", "PLANO"],
  nature: ["NATUREZA", "NATURE"],
  behavior: ["COMPORTAMENTO", "BEHAVIOR", "FIXO VARIAVEL"],
  area: ["AREA", "SETOR", "DEPARTAMENTO"],
  client: ["CLIENTE", "CLIENT", "EMPRESA"],
};

export function guessRuleMapping(columns: string[]): Partial<Record<RuleField, string>> {
  const mapping: Partial<Record<RuleField, string>> = {};
  const used = new Set<string>();
  for (const field of RULE_FIELDS) {
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

const NATURE_ENTRIES = Object.entries(NATURE_LABEL) as [Nature, string][];
const BEHAVIOR_ENTRIES = Object.entries(BEHAVIOR_LABEL) as [Behavior, string][];

export function resolveNature(value: string): Nature | null {
  const n = normalize(value);
  if (!n) return null;
  for (const [key, label] of NATURE_ENTRIES) {
    if (n === normalize(key) || n === normalize(label)) return key;
  }
  return null;
}

export function resolveBehavior(value: string): Behavior | null {
  const n = normalize(value);
  if (!n) return "nao_definido";
  for (const [key, label] of BEHAVIOR_ENTRIES) {
    if (n === normalize(key) || n === normalize(label)) return key;
  }
  return null;
}

export function resolveMatchField(value: string): "description" | "counterparty" | null {
  const n = normalize(value);
  if (!n) return "description";
  if (["COUNTERPARTY", "FORNECEDOR", "CONTRAPARTE", "FAVORECIDO", "CLIENTE FORNECEDOR"].includes(n))
    return "counterparty";
  if (["DESCRIPTION", "DESCRICAO", "HISTORICO", "DESCRICAO DO LANCAMENTO"].includes(n))
    return "description";
  return null;
}

export interface ParsedRule {
  pattern: string;
  match_field: "description" | "counterparty";
  account: string;
  nature: Nature;
  behavior: Behavior;
  area: string | null;
  client_name: string | null;
  client_id: string | null;
  source_row: number;
}

export interface RuleRowError {
  row: number;
  reason: string;
}

export interface RulesParseResult {
  rules: ParsedRule[];
  errors: RuleRowError[];
  read: number;
  duplicatesMerged: number;
}

export interface ClientRef {
  id: string;
  name: string;
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

const ruleKey = (r: ParsedRule) =>
  `${r.client_id ?? "global"}::${r.match_field}::${normalize(r.pattern)}`;

const sameValues = (a: ParsedRule, b: ParsedRule) =>
  a.account === b.account &&
  a.nature === b.nature &&
  a.behavior === b.behavior &&
  (a.area ?? "") === (b.area ?? "");

export function buildRulesFromRows(
  rows: Record<string, unknown>[],
  mapping: Partial<Record<RuleField, string>>,
  clients: ClientRef[],
  options?: { canCreateGlobal?: boolean },
): RulesParseResult {
  const canCreateGlobal = options?.canCreateGlobal ?? true;
  const errors: RuleRowError[] = [];
  const byKey = new Map<string, ParsedRule>();
  let duplicatesMerged = 0;

  const pick = (row: Record<string, unknown>, field: RuleField) => {
    const col = mapping[field];
    return col ? text(row[col]) : "";
  };

  rows.forEach((row, index) => {
    const line = index + 1;
    const pattern = pick(row, "pattern");
    const account = pick(row, "account");
    const natureRaw = pick(row, "nature");
    const behaviorRaw = pick(row, "behavior");
    const matchRaw = pick(row, "match_field");
    const area = pick(row, "area");
    const clientRaw = pick(row, "client");

    if (!pattern && !account && !natureRaw) return; // linha vazia

    if (!pattern) {
      errors.push({ row: line, reason: "Padrão vazio." });
      return;
    }
    if (!account) {
      errors.push({ row: line, reason: "Conta gerencial vazia." });
      return;
    }
    const nature = resolveNature(natureRaw);
    if (!nature || nature === "nao_definido") {
      errors.push({ row: line, reason: `Natureza inválida: “${natureRaw || "vazio"}”.` });
      return;
    }
    const behavior = resolveBehavior(behaviorRaw);
    if (!behavior) {
      errors.push({ row: line, reason: `Comportamento inválido: “${behaviorRaw}”.` });
      return;
    }
    const match_field = resolveMatchField(matchRaw);
    if (!match_field) {
      errors.push({ row: line, reason: `Campo de correspondência inválido: “${matchRaw}”.` });
      return;
    }

    let client_id: string | null = null;
    if (clientRaw) {
      const found = clients.find((c) => normalize(c.name) === normalize(clientRaw));
      if (!found) {
        errors.push({ row: line, reason: `Cliente não encontrado: “${clientRaw}”.` });
        return;
      }
      client_id = found.id;
    } else if (!canCreateGlobal) {
      errors.push({
        row: line,
        reason: "Regra global (sem cliente) exige perfil de administrador.",
      });
      return;
    }

    const parsed: ParsedRule = {
      pattern,
      match_field,
      account,
      nature,
      behavior,
      area: area || null,
      client_name: clientRaw || null,
      client_id,
      source_row: line,
    };

    const key = ruleKey(parsed);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, parsed);
      return;
    }
    if (sameValues(existing, parsed)) {
      duplicatesMerged += 1;
      return;
    }
    errors.push({
      row: line,
      reason: `Conflito no arquivo: padrão “${parsed.pattern}” repetido com valores diferentes (linha ${existing.source_row}).`,
    });
    byKey.delete(key);
    errors.push({
      row: existing.source_row,
      reason: `Conflito no arquivo: padrão “${existing.pattern}” repetido com valores diferentes (linha ${line}).`,
    });
  });

  return {
    rules: [...byKey.values()],
    errors: errors.sort((a, b) => a.row - b.row),
    read: rows.length,
    duplicatesMerged,
  };
}
