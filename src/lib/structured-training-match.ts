import { normalize, type HistoryLike, type RawEntry } from "./classify";

export type StructuredTrainingMatch = {
  history: HistoryLike;
  confidence: number;
  reason: "structured_identity";
};

type Direction = "ENTRADA" | "SAIDA" | null;
type IdentityClass = "financial_charge" | "financing_principal" | "boleto" | "pix" | "neutral";

const VARIABLE_TOKEN = /^(?:\d+|\d{2,}[A-Z0-9]*|[A-Z0-9]*\d{2,})$/;
const STOP_TOKENS = new Set([
  "DOC",
  "DOCUMENTO",
  "CNPJ",
  "CPF",
  "BANCO",
  "AG",
  "AGENCIA",
  "CC",
  "CONTA",
  "COD",
  "CODIGO",
  "NSU",
  "ID",
]);

function splitKey(key: string): { direction: Direction; subject: string } {
  const normalized = normalize(key);
  const match = normalized.match(/^(ENTRADA|SAIDA)\s+(.+)$/);
  if (match) return { direction: match[1] as Direction, subject: match[2] };

  // normalize() removes the pipe from ENTRADA|X, so preserve the original prefix too.
  if (key.startsWith("ENTRADA|")) return { direction: "ENTRADA", subject: normalize(key.slice(8)) };
  if (key.startsWith("SAIDA|")) return { direction: "SAIDA", subject: normalize(key.slice(6)) };
  return { direction: null, subject: normalized };
}

function identityClass(subject: string): IdentityClass {
  if (/\b(IOF|JUROS|TARIFA|ENCARGO|MULTA)\b/.test(subject)) return "financial_charge";
  if (/\b(LIBERACAO CREDITO|EMPRESTIMO|FINANCIAMENTO|AMORTIZACAO)\b/.test(subject)) {
    return "financing_principal";
  }
  if (/\b(BOLETO|COBRANCA)\b/.test(subject)) return "boleto";
  if (/\bPIX\b/.test(subject)) return "pix";
  return "neutral";
}

function stableTokens(subject: string): string[] {
  return normalize(subject)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !STOP_TOKENS.has(token))
    .filter((token) => !VARIABLE_TOKEN.test(token));
}

function compatibleClass(a: IdentityClass, b: IdentityClass): boolean {
  if (a === b) return true;
  if (a === "neutral" || b === "neutral") return false;
  return false;
}

function structuredSimilarity(a: string, b: string): number {
  const aTokens = new Set(stableTokens(a));
  const bTokens = new Set(stableTokens(b));
  if (aTokens.size < 2 || bTokens.size < 2) return 0;

  let common = 0;
  for (const token of aTokens) if (bTokens.has(token)) common += 1;
  if (common < 2) return 0;

  return common / Math.max(aTokens.size, bTokens.size);
}

/**
 * Segundo nivel conservador de matching.
 *
 * Regras de seguranca:
 * - nunca substitui historyKey exata;
 * - exige direcao conhecida e igual nos dois lados;
 * - exige a mesma classe financeira;
 * - remove apenas tokens claramente variaveis/documentais;
 * - exige pelo menos dois tokens estaveis em comum;
 * - se mais de uma classificacao historica competir pelo melhor match, nao sugere nada.
 *
 * O retorno deve ser usado inicialmente como "sugerido", nunca como classificacao automatica.
 */
export function findStructuredTrainingMatch(
  entry: RawEntry,
  history: HistoryLike[],
  entryKey: string,
): StructuredTrainingMatch | null {
  const pending = splitKey(entryKey);
  if (!pending.direction || !pending.subject) return null;

  const pendingClass = identityClass(pending.subject);
  if (pendingClass === "neutral") return null;

  const candidates = history
    .map((item) => {
      const historical = splitKey(item.key);
      if (!historical.direction || historical.direction !== pending.direction) return null;
      if (!compatibleClass(pendingClass, identityClass(historical.subject))) return null;

      const similarity = structuredSimilarity(pending.subject, historical.subject);
      if (similarity < 0.66) return null;
      return { history: item, similarity };
    })
    .filter((item): item is { history: HistoryLike; similarity: number } => Boolean(item))
    .sort((a, b) => b.similarity - a.similarity);

  const best = candidates[0];
  if (!best) return null;

  const competing = candidates.filter((candidate) => candidate.similarity === best.similarity);
  const classifications = new Set(
    competing.map(
      ({ history: item }) => `${item.account}|${item.nature}|${item.behavior}|${item.area ?? ""}`,
    ),
  );
  if (classifications.size > 1) return null;

  return {
    history: best.history,
    confidence: 0.72,
    reason: "structured_identity",
  };
}
