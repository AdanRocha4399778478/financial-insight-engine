import {
  counterpartyFromDescription,
  historyKey,
  movementDirectionFromDescription,
  normalize,
  type HistoryLike,
  type RawEntry,
} from "./classify";

export type CanonicalDirection = "ENTRADA" | "SAIDA" | null;
export type CanonicalOperation =
  | "financial_charge"
  | "financing_principal"
  | "boleto"
  | "pix"
  | "transfer"
  | "cheque"
  | "payment"
  | "neutral";

export type IdentityGapReason =
  | "direction_only_from_amount"
  | "direction_mismatch"
  | "operation_mismatch"
  | "identity_near"
  | "identity_mismatch";

export interface CanonicalIdentity {
  key: string;
  textDirection: CanonicalDirection;
  amountDirection: CanonicalDirection;
  resolvedDirection: CanonicalDirection;
  operation: CanonicalOperation;
  subject: string;
  tokens: string[];
}

export interface IdentityGapDiagnostic {
  pendingKey: string;
  candidateKey: string;
  candidateAccount: string;
  score: number;
  reasons: IdentityGapReason[];
  pendingDirection: CanonicalDirection;
  candidateDirection: CanonicalDirection;
  pendingOperation: CanonicalOperation;
  candidateOperation: CanonicalOperation;
  tokenSimilarity: number;
}

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

const VARIABLE_TOKEN = /^(?:\d+|\d{2,}[A-Z0-9]*|[A-Z0-9]*\d{2,})$/;

function directionFromAmount(amount: number): CanonicalDirection {
  if (amount > 0) return "ENTRADA";
  if (amount < 0) return "SAIDA";
  return null;
}

function directionFromDescription(description: string): CanonicalDirection {
  const direction = movementDirectionFromDescription(description);
  if (direction === "entrada") return "ENTRADA";
  if (direction === "saida") return "SAIDA";
  return null;
}

function splitHistoryKey(key: string): { direction: CanonicalDirection; subject: string } {
  if (key.startsWith("ENTRADA|")) return { direction: "ENTRADA", subject: normalize(key.slice(8)) };
  if (key.startsWith("SAIDA|")) return { direction: "SAIDA", subject: normalize(key.slice(6)) };
  return { direction: null, subject: normalize(key) };
}

export function operationFromText(value: string): CanonicalOperation {
  const subject = normalize(value);
  if (/\b(IOF|JUROS|TARIFA|ENCARGO|MULTA)\b/.test(subject)) return "financial_charge";
  if (/\b(LIBERACAO CREDITO|EMPRESTIMO|FINANCIAMENTO|AMORTIZACAO)\b/.test(subject)) {
    return "financing_principal";
  }
  if (/\b(BOLETO|COBRANCA)\b/.test(subject)) return "boleto";
  if (/\bPIX\b/.test(subject)) return "pix";
  if (/\b(TRANSF|TRANSFERENCIA)\b/.test(subject)) return "transfer";
  if (/\bCHEQUE\b/.test(subject)) return "cheque";
  if (/\b(PAGAMENTO|PAGTO)\b/.test(subject)) return "payment";
  return "neutral";
}

export function stableIdentityTokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !STOP_TOKENS.has(token))
    .filter((token) => !VARIABLE_TOKEN.test(token));
}

function tokenSimilarity(a: string[], b: string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common / Math.max(left.size, right.size);
}

export function canonicalIdentityForEntry(entry: RawEntry): CanonicalIdentity {
  const pendingKey = historyKey({ description: entry.description, counterparty: entry.counterparty });
  const keyParts = splitHistoryKey(pendingKey);
  const textDirection = keyParts.direction ?? directionFromDescription(entry.description);
  const amountDirection = directionFromAmount(Number(entry.amount ?? 0));
  const counterparty = normalize(entry.counterparty) || counterpartyFromDescription(entry.description);
  const subject = counterparty || keyParts.subject || normalize(entry.description);

  return {
    key: pendingKey,
    textDirection,
    amountDirection,
    resolvedDirection: textDirection ?? amountDirection,
    operation: operationFromText(`${entry.description} ${subject}`),
    subject,
    tokens: stableIdentityTokens(subject),
  };
}

function canonicalIdentityForHistory(history: HistoryLike): CanonicalIdentity {
  const parts = splitHistoryKey(history.key);
  return {
    key: history.key,
    textDirection: parts.direction,
    amountDirection: null,
    resolvedDirection: parts.direction,
    operation: operationFromText(parts.subject),
    subject: parts.subject,
    tokens: stableIdentityTokens(parts.subject),
  };
}

function diagnosticFor(entry: CanonicalIdentity, historical: CanonicalIdentity, account: string): IdentityGapDiagnostic {
  const reasons: IdentityGapReason[] = [];
  const similarity = tokenSimilarity(entry.tokens, historical.tokens);

  if (!entry.textDirection && entry.amountDirection && entry.amountDirection === historical.resolvedDirection) {
    reasons.push("direction_only_from_amount");
  }
  if (entry.resolvedDirection && historical.resolvedDirection && entry.resolvedDirection !== historical.resolvedDirection) {
    reasons.push("direction_mismatch");
  }
  if (
    entry.operation !== "neutral" &&
    historical.operation !== "neutral" &&
    entry.operation !== historical.operation
  ) {
    reasons.push("operation_mismatch");
  }
  reasons.push(similarity >= 0.5 ? "identity_near" : "identity_mismatch");

  let score = similarity * 60;
  if (entry.resolvedDirection && entry.resolvedDirection === historical.resolvedDirection) score += 20;
  if (entry.operation !== "neutral" && entry.operation === historical.operation) score += 20;
  if (reasons.includes("direction_mismatch")) score -= 35;
  if (reasons.includes("operation_mismatch")) score -= 35;

  return {
    pendingKey: entry.key,
    candidateKey: historical.key,
    candidateAccount: account,
    score: Math.max(0, Math.min(100, Number(score.toFixed(1)))),
    reasons,
    pendingDirection: entry.resolvedDirection,
    candidateDirection: historical.resolvedDirection,
    pendingOperation: entry.operation,
    candidateOperation: historical.operation,
    tokenSimilarity: Number(similarity.toFixed(3)),
  };
}

/**
 * Diagnostico somente-leitura para explicar por que uma pendencia nao casa com
 * o treinamento. O sinal do valor pode inferir direcao aqui, mas esta funcao
 * nao altera historyKey nem o classificador produtivo.
 */
export function findBestIdentityGapDiagnostic(
  entry: RawEntry,
  history: HistoryLike[],
): IdentityGapDiagnostic | null {
  const pending = canonicalIdentityForEntry(entry);
  if (!pending.key || !history.length) return null;

  const ranked = history
    .map((item) => diagnosticFor(pending, canonicalIdentityForHistory(item), item.account))
    .sort((a, b) => b.score - a.score);

  return ranked[0] ?? null;
}
