import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { historyKey } from "./classify";

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

export const diagnoseTrainingMatchGaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clientId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const [{ data: pendingRows, error: pendingError }, { data: trainingRows, error: trainingError }] = await Promise.all([
      supabase
        .from("entries")
        .select("description, counterparty, amount")
        .eq("client_id", data.clientId)
        .eq("status", "pendente")
        .limit(5000),
      supabase
        .from("training_examples")
        .select("history_key, account")
        .eq("client_id", data.clientId)
        .eq("active", true)
        .limit(50000),
    ]);

    if (pendingError) throw new Error(pendingError.message);
    if (trainingError) throw new Error(trainingError.message);

    const trainingKeys = [...new Set((trainingRows ?? []).map((row) => row.history_key).filter(Boolean))] as string[];
    const trainingKeySet = new Set(trainingKeys);
    const accountByTrainingKey = new Map<string, string>();
    for (const row of trainingRows ?? []) {
      if (row.history_key && row.account && !accountByTrainingKey.has(row.history_key)) {
        accountByTrainingKey.set(row.history_key, row.account);
      }
    }

    const grouped = new Map<string, {
      pendingKey: string;
      count: number;
      totalAmount: number;
      sampleDescription: string;
    }>();

    for (const row of pendingRows ?? []) {
      const key = historyKey({ description: row.description, counterparty: row.counterparty });
      if (!key || trainingKeySet.has(key)) continue;

      const current = grouped.get(key) ?? {
        pendingKey: key,
        count: 0,
        totalAmount: 0,
        sampleDescription: row.description,
      };
      current.count += 1;
      current.totalAmount += Math.abs(Number(row.amount) || 0);
      grouped.set(key, current);
    }

    const ranked = [...grouped.values()].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.totalAmount - a.totalAmount;
    });

    const items = ranked.slice(0, data.limit).map((item) => {
      let candidateKey: string | null = null;
      let relation: "direction_mismatch" | "partial_identity" | "no_candidate" = "no_candidate";

      for (const trainingKey of trainingKeys) {
        const nextRelation = relationFor(item.pendingKey, trainingKey);
        if (!nextRelation) continue;
        candidateKey = trainingKey;
        relation = nextRelation;
        if (nextRelation === "direction_mismatch") break;
      }

      return {
        ...item,
        candidateKey,
        candidateAccount: candidateKey ? accountByTrainingKey.get(candidateKey) ?? null : null,
        relation,
      };
    });

    return {
      totalPending: pendingRows?.length ?? 0,
      activeTrainingKeys: trainingKeys.length,
      exactMatches: (pendingRows ?? []).reduce((sum, row) => {
        const key = historyKey({ description: row.description, counterparty: row.counterparty });
        return sum + (key && trainingKeySet.has(key) ? 1 : 0);
      }, 0),
      uncoveredIdentities: grouped.size,
      items,
    };
  });
