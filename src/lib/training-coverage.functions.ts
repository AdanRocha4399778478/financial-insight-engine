import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BEHAVIORS, NATURES } from "./finance";
import { historyKey } from "./classify";
import { mergeHistoryCandidates, type HistoryCandidate } from "./classification-history";
import {
  prepareTrainingBatch,
  type ExistingTrainingExample,
  type TrainingInputRow,
} from "./training-import";

const natureEnum = z.enum(NATURES as [string, ...string[]]);
const behaviorEnum = z.enum(BEHAVIORS as [string, ...string[]]);

const diagnosticsSchema = z.object({
  rawDescription: z.string().max(500).nullable().optional(),
  rawDetailedDescription: z.string().max(500).nullable().optional(),
  rawDirection: z.string().max(80).nullable().optional(),
}).optional();

const trainingRowSchema = z.object({
  description: z.string().max(500),
  counterparty: z.string().max(240).nullable(),
  originalCategory: z.string().max(240).nullable(),
  account: z.string().trim().min(1).max(120),
  nature: natureEnum,
  behavior: behaviorEnum,
  area: z.string().max(80).nullable(),
  sourceRowNumber: z.number().int().positive(),
  diagnostics: diagnosticsSchema,
});

function toExisting(row: {
  history_key: string;
  account: string;
  nature: string;
  behavior: string;
  area: string | null;
  fingerprint: string;
}): ExistingTrainingExample {
  return {
    historyKey: row.history_key,
    account: row.account,
    nature: row.nature as ExistingTrainingExample["nature"],
    behavior: row.behavior as ExistingTrainingExample["behavior"],
    area: row.area,
    fingerprint: row.fingerprint,
  };
}

function subjectOf(key: string): string {
  return key.replace(/^(ENTRADA|SAIDA)\|/, "");
}

function relationFor(pendingKey: string, trainingKey: string): "direction_mismatch" | "partial_identity" | null {
  const pendingSubject = subjectOf(pendingKey);
  const trainingSubject = subjectOf(trainingKey);

  if (pendingSubject === trainingSubject && pendingKey !== trainingKey) return "direction_mismatch";

  if (
    pendingSubject.length >= 8 &&
    trainingSubject.length >= 8 &&
    (pendingSubject.includes(trainingSubject) || trainingSubject.includes(pendingSubject))
  ) {
    return "partial_identity";
  }

  return null;
}

export const estimateTrainingCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clientId: z.string().uuid(), rows: z.array(trainingRowSchema).min(1).max(10000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: existingRows, error: existingError } = await supabase
      .from("training_examples")
      .select("history_key, account, nature, behavior, area, fingerprint")
      .eq("client_id", data.clientId)
      .eq("active", true)
      .limit(50000);
    if (existingError) throw new Error(existingError.message);

    const existing = (existingRows ?? []).map(toExisting);
    const inputRows = data.rows as TrainingInputRow[];
    const prepared = prepareTrainingBatch(data.clientId, inputRows, existing);

    const candidates: HistoryCandidate[] = [];
    for (const row of existing) {
      if (!row.historyKey || !row.account) continue;
      candidates.push({
        key: row.historyKey,
        account: row.account,
        nature: row.nature,
        behavior: row.behavior,
        area: row.area,
        source: "training",
      });
    }
    for (const row of prepared.ready) {
      candidates.push({
        key: row.historyKey,
        account: row.account,
        nature: row.nature,
        behavior: row.behavior,
        area: row.area,
        source: "training",
      });
    }

    const merged = mergeHistoryCandidates(candidates);
    const safeKeys = new Set(merged.history.map((row) => row.key));
    const conflictKeys = new Set<string>([
      ...merged.conflicts,
      ...prepared.conflicts.map((conflict) => conflict.historyKey),
    ]);
    const accountByKey = new Map(merged.history.map((row) => [row.key, row.account]));
    const candidateKeys = [...new Set(candidates.map((row) => row.key).filter(Boolean))];

    const trainingSamples = prepared.ready.slice(0, 12).map((row) => ({
      sourceRowNumber: row.sourceRowNumber,
      rawDescription: row.diagnostics?.rawDescription ?? null,
      rawDetailedDescription: row.diagnostics?.rawDetailedDescription ?? null,
      rawDirection: row.diagnostics?.rawDirection ?? null,
      producedDescription: row.description,
      producedCounterparty: row.counterparty,
      historyKey: row.historyKey,
      account: row.account,
    }));

    const { data: pendingRows, error: pendingError } = await supabase
      .from("entries")
      .select("id, description, counterparty")
      .eq("client_id", data.clientId)
      .eq("status", "pendente")
      .limit(5000);
    if (pendingError) throw new Error(pendingError.message);

    let safeMatches = 0;
    let conflictMatches = 0;
    let uncovered = 0;
    const matchedKeys = new Set<string>();
    const conflictMatchedKeys = new Set<string>();
    const uncoveredKeys = new Set<string>();
    const pendingSampleByKey = new Map<string, { description: string; counterparty: string | null }>();

    for (const row of pendingRows ?? []) {
      const key = historyKey({ description: row.description, counterparty: row.counterparty });
      if (key && conflictKeys.has(key)) {
        conflictMatches += 1;
        conflictMatchedKeys.add(key);
      } else if (key && safeKeys.has(key)) {
        safeMatches += 1;
        matchedKeys.add(key);
      } else {
        uncovered += 1;
        if (key) {
          uncoveredKeys.add(key);
          if (!pendingSampleByKey.has(key)) {
            pendingSampleByKey.set(key, { description: row.description, counterparty: row.counterparty });
          }
        }
      }
    }

    const mismatchDiagnostics = [...uncoveredKeys].slice(0, 12).map((pendingKey) => {
      let candidateKey: string | null = null;
      let relation: "direction_mismatch" | "partial_identity" | "no_candidate" = "no_candidate";

      for (const trainingKey of candidateKeys) {
        const nextRelation = relationFor(pendingKey, trainingKey);
        if (!nextRelation) continue;
        candidateKey = trainingKey;
        relation = nextRelation;
        if (nextRelation === "direction_mismatch") break;
      }

      const pendingSample = pendingSampleByKey.get(pendingKey);
      return {
        pendingKey,
        pendingDescription: pendingSample?.description ?? null,
        pendingCounterparty: pendingSample?.counterparty ?? null,
        candidateKey,
        candidateAccount: candidateKey ? accountByKey.get(candidateKey) ?? null : null,
        relation,
      };
    });

    const total = pendingRows?.length ?? 0;
    return {
      totalPending: total,
      safeMatches,
      conflictMatches,
      uncovered,
      estimatedCoveragePct: total > 0 ? Number(((safeMatches / total) * 100).toFixed(1)) : 0,
      safeHistoryKeys: matchedKeys.size,
      conflictHistoryKeys: conflictMatchedKeys.size,
      uncoveredHistoryKeys: uncoveredKeys.size,
      samples: {
        matched: [...matchedKeys].slice(0, 8),
        conflicts: [...conflictMatchedKeys].slice(0, 8),
        uncovered: [...uncoveredKeys].slice(0, 8),
      },
      mismatchDiagnostics,
      trainingSamples,
    };
  });
