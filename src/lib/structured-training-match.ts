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
  "LIQUIDACAO",
  "BOLETO",
  "COBRANCA",
  "PAGAMENTO",
  "PAGTO",
  "PIX",
  "RECEBIMENTO",
  "RECEBIDO",
  "ENVIADO",
  "REM",
  "DES",
]);

function splitKey(key: string): { direction: Direction; subject: string } {
  const normalized = normalize(key);
  const match = normalized.match(/^(ENTRADA|SAIDA)\s+(.+)$/);
  if (match?.[1] && match[2]) {
    return { direction: match[1] as Exclude<Direction, null>, subject: match[2] };
  }

  if (key.startsWith("ENTRADA|")) return { direction: "ENTRADA", subject: normalize(key.slice(8)) };
  if (key.startsWith("SAIDA|")) return { direction: "SAIDA", subject: normalize(key.slice(6)) };
  return { direction: null, subject: normalized };
}

function directionFromAmount(amount: number): Direction {
  if (amount > 0) return "ENTRADA";
  if (amount < 0) return "SAIDA";
  return null;
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
  return a !== "neutral" && a === b;
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

function classificationKey(item: HistoryLike): string {
  return `${item.account}|${item.nature}|${item.behavior}|${item.area ?? ""}`;
}

function tokenSet(value: string): Set<string> {
  return new Set(stableTokens(value));
}

function sharesCoreIdentity(a: string, b: string): boolean {
  const left = tokenSet(a);
  const right = tokenSet(b);
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common >= 2;
}

/**
 * Segundo nivel conservador de matching.
 *
 * Regras de seguranca:
 * - nunca substitui historyKey exata;
 * - usa a direcao do historyKey quando existe e, somente como fallback, o sinal do valor;
 * - exige direcao igual entre pendencia e historico;
 * - exige a mesma classe financeira, nunca classe neutra;
 * - ignora palavras da operacao e numeros para comparar a identidade economica real;
 * - exige pelo menos dois tokens estaveis em comum e similaridade minima de 60%;
 * - se houver candidatos da mesma familia de identidade apontando para classificacoes diferentes, nao sugere;
 * - o retorno continua sendo apenas sugestao, nunca automatico.
 */
export function findStructuredTrainingMatch(
  entry: RawEntry,
  history: HistoryLike[],
  entryKey: string,
): StructuredTrainingMatch | null {
  const pending = splitKey(entryKey);
  const pendingDirection = pending.direction ?? directionFromAmount(Number(entry.amount ?? 0));
  if (!pendingDirection || !pending.subject) return null;

  const pendingClass = identityClass(`${entry.description} ${pending.subject}`);
  if (pendingClass === "neutral") return null;

  const candidates = history
    .map((item) => {
      const historical = splitKey(item.key);
      if (!historical.direction || historical.direction !== pendingDirection) return null;
      if (!compatibleClass(pendingClass, identityClass(historical.subject))) return null;

      const similarity = structuredSimilarity(pending.subject, historical.subject);
      if (similarity < 0.6) return null;
      return { history: item, subject: historical.subject, similarity };
    })
    .filter((item): item is { history: HistoryLike; subject: string; similarity: number } => Boolean(item))
    .sort((a, b) => b.similarity - a.similarity);

  const best = candidates[0];
  if (!best) return null;

  const sameIdentityFamily = candidates.filter((candidate) =>
    sharesCoreIdentity(best.subject, candidate.subject),
  );
  const classifications = new Set(sameIdentityFamily.map(({ history: item }) => classificationKey(item)));
  if (classifications.size > 1) return null;

  return {
    history: best.history,
    confidence: 0.72,
    reason: "structured_identity",
  };
}
