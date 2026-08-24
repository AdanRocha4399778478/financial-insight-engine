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

const trainingRowSchema = z.object({
  description: z.string().max(500),
  counterparty: z.string().max(240).nullable(),
  originalCategory: z.string().max(240).nullable(),
  account: z.string().trim().min(1).max(120),
  nature: natureEnum,
  behavior: behaviorEnum,
  area: z.string().max(80).nullable(),
  sourceRowNumber: z.number().int().positive(),
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
    const prepared = prepareTrainingBatch(data.clientId, data.rows as TrainingInputRow[], existing);

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
        if (key) uncoveredKeys.add(key);
      }
    }

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
    };
  });
