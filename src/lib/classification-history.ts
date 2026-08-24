import type { HistoryLike } from "./classify";

export interface HistoryCandidate extends HistoryLike {
  source?: "entry" | "training";
}

export interface HistoryMergeResult {
  history: HistoryLike[];
  conflicts: Set<string>;
}

function sameClassification(a: HistoryLike, b: HistoryLike): boolean {
  return (
    a.account === b.account &&
    a.nature === b.nature &&
    a.behavior === b.behavior &&
    a.area === b.area
  );
}

/**
 * Consolida conhecimento histórico sem escolher silenciosamente entre
 * classificações divergentes para a mesma chave.
 *
 * Uma chave conflitante é removida do histórico automático e deverá cair
 * para regras de menor prioridade ou pendência/revisão humana.
 */
export function mergeHistoryCandidates(candidates: HistoryCandidate[]): HistoryMergeResult {
  const historyMap = new Map<string, HistoryLike>();
  const conflicts = new Set<string>();

  for (const candidate of candidates) {
    const key = candidate.key.trim();
    if (!key || conflicts.has(key)) continue;

    const current = historyMap.get(key);
    if (!current) {
      historyMap.set(key, {
        key,
        account: candidate.account,
        nature: candidate.nature,
        behavior: candidate.behavior,
        area: candidate.area,
      });
      continue;
    }

    if (!sameClassification(current, candidate)) {
      historyMap.delete(key);
      conflicts.add(key);
    }
  }

  return { history: [...historyMap.values()], conflicts };
}
