import type { Behavior, Nature } from "./finance";

export interface RuleLike {
  id: string;
  client_id: string | null;
  segment: string | null;
  match_field: string;
  pattern: string;
  account: string;
  nature: Nature;
  behavior: Behavior;
  area: string | null;
  confirmed: boolean;
}

export interface HistoryLike {
  key: string;
  account: string;
  nature: Nature;
  behavior: Behavior;
  area: string | null;
}

export interface RawEntry {
  description: string;
  counterparty: string | null;
  original_category: string | null;
  amount: number;
}

export interface Classification {
  account: string | null;
  nature: Nature;
  behavior: Behavior;
  area: string | null;
  confidence: number;
  source: string;
  status: "auto" | "sugerido" | "pendente";
}

export type MovementDirection = "entrada" | "saida";

export const normalize = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function cleanExtractedCounterparty(value: string): string {
  return normalize(value.replace(/\s+\d{2}\/\d{2}\s*$/, ""));
}

/**
 * Direcao economica inferida apenas quando o proprio historico bancario a
 * declara de forma suficientemente clara. Evitamos inferir por sinal/valor
 * aqui porque historyKey tambem e usado em contextos sem amount disponivel.
 */
export function movementDirectionFromDescription(description: string): MovementDirection | null {
  const raw = normalize(description);
  if (!raw) return null;

  if (
    raw.startsWith("PIX RECEBIDO REM ") ||
    raw.startsWith("TED TRANSF ELET DISPON REMET ")
  ) {
    return "entrada";
  }

  if (
    raw.startsWith("PIX ENVIADO DES ") ||
    raw.startsWith("PIX QR CODE DINAMICO DES ") ||
    raw.startsWith("PIX QR CODE ESTATICO DES ") ||
    raw.startsWith("COMPRA CARTAO VISA ") ||
    raw.startsWith("CARTAO VISA ELECTRON ") ||
    raw.startsWith("PAGTO ELETRON COBRANCA ")
  ) {
    return "saida";
  }

  return null;
}

/**
 * Extrai a contraparte quando ela vem embutida no historico bancario.
 * Mantemos esta logica junto do historyKey para que treinamento e futuras
 * importacoes usem exatamente a mesma identidade historica.
 */
export function counterpartyFromDescription(description: string): string | null {
  const raw = (description ?? "").trim();
  if (!raw) return null;

  const patterns = [
    /^PIX\s+QR\s+CODE\s+DINAMICO\s+DES:\s*(.+)$/i,
    /^PIX\s+QR\s+CODE\s+ESTATICO\s+DES:\s*(.+)$/i,
    /^PIX\s+ENVIADO\s+DES:\s*(.+)$/i,
    /^PIX\s+RECEBIDO\s+REM:\s*(.+)$/i,
    /^TED-TRANSF\s+ELET\s+DISPON\s+REMET\.\s*(.+)$/i,
    /^COMPRA\s+CARTAO\s+VISA\s+(.+)$/i,
    /^CARTAO\s+VISA\s+ELECTRON\s+(.+)$/i,
    /^PAGTO\s+ELETRON\s+COBRANCA\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match?.[1]) continue;
    const candidate = cleanExtractedCounterparty(match[1]);
    if (candidate) return candidate;
  }

  return null;
}

export function historyKey(e: { description: string; counterparty: string | null }): string {
  const direction = movementDirectionFromDescription(e.description);
  const counterparty = normalize(e.counterparty) || counterpartyFromDescription(e.description);

  if (counterparty) return direction ? `${direction.toUpperCase()}|${counterparty}` : counterparty;

  const fallback = normalize(e.description).split(" ").slice(0, 4).join(" ");
  if (!fallback) return "";
  return direction ? `${direction.toUpperCase()}|${fallback}` : fallback;
}

export function statusFor(confidence: number): Classification["status"] {
  if (confidence >= 0.85) return "auto";
  if (confidence >= 0.5) return "sugerido";
  return "pendente";
}

const PENDING: Classification = {
  account: null,
  nature: "nao_definido",
  behavior: "nao_definido",
  area: null,
  confidence: 0,
  source: "sem_correspondencia",
  status: "pendente",
};

function matches(rule: RuleLike, entry: RawEntry): boolean {
  const pattern = normalize(rule.pattern);
  if (!pattern) return false;
  const haystack =
    rule.match_field === "counterparty"
      ? normalize(entry.counterparty)
      : rule.match_field === "original_category"
        ? normalize(entry.original_category)
        : `${normalize(entry.description)} ${normalize(entry.counterparty)}`;
  return haystack.includes(pattern);
}

/**
 * Ordem de prioridade (spec §11):
 * 1. regra confirmada do cliente
 * 2. historico do cliente
 * 3. regra do segmento
 * 4. regra geral Resultados
 * 5. correspondencia por fornecedor
 * 6. correspondencia por descricao
 * 7. IA (aplicada fora deste motor)
 */
export function classifyEntry(
  entry: RawEntry,
  ctx: { clientId: string; segment: string | null; rules: RuleLike[]; history: HistoryLike[] },
): Classification {
  const apply = (
    r: { account: string; nature: Nature; behavior: Behavior; area: string | null },
    confidence: number,
    source: string,
  ): Classification => ({
    account: r.account,
    nature: r.nature,
    behavior: r.behavior,
    area: r.area,
    confidence,
    source,
    status: statusFor(confidence),
  });

  const clientRules = ctx.rules.filter((r) => r.client_id === ctx.clientId);

  const confirmed = clientRules.find((r) => r.confirmed && matches(r, entry));
  if (confirmed) return apply(confirmed, 0.98, "regra_confirmada_cliente");

  const key = historyKey(entry);
  const hist = key ? ctx.history.find((h) => h.key === key) : undefined;
  if (hist) return apply(hist, 0.92, "historico_cliente");

  const clientRule = clientRules.find((r) => matches(r, entry));
  if (clientRule) return apply(clientRule, 0.88, "regra_cliente");

  const segmentRule = ctx.segment
    ? ctx.rules.find(
        (r) =>
          r.client_id === null &&
          r.segment &&
          normalize(r.segment) === normalize(ctx.segment) &&
          matches(r, entry),
      )
    : undefined;
  if (segmentRule) return apply(segmentRule, 0.78, "regra_segmento");

  const generalRule = ctx.rules.find(
    (r) => r.client_id === null && !r.segment && matches(r, entry),
  );
  if (generalRule) return apply(generalRule, 0.7, "regra_geral");

  const bySupplier = ctx.rules.find(
    (r) => r.match_field === "counterparty" && matches(r, entry),
  );
  if (bySupplier) return apply(bySupplier, 0.65, "fornecedor");

  return PENDING;
}

/** Impressao digital deterministica para prevencao de duplicidade (spec §8). */
export function fingerprint(parts: (string | number | null | undefined)[]): string {
  const input = parts.map((p) => normalize(String(p ?? ""))).join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
