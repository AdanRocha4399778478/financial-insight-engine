import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { classifyEntry, historyKey, type RuleLike } from "./classify";
import { mergeHistoryCandidates, type HistoryCandidate } from "./classification-history";
import { findStructuredTrainingMatch } from "./structured-training-match";

const STRUCTURED_TRAINING_CONFIDENCE = 0.72;
const STRUCTURED_TRAINING_SOURCE = "training_structured";

export const reclassifyPendingFromLearning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, segment")
      .eq("id", data.clientId)
      .maybeSingle();
    if (clientError) throw new Error(clientError.message);
    if (!client) throw new Error("Cliente não encontrado ou sem permissão de acesso.");

    const { data: rules, error: rulesError } = await supabase
      .from("rules")
      .select("*")
      .eq("active", true)
      .or(`client_id.eq.${data.clientId},client_id.is.null`);
    if (rulesError) throw new Error(rulesError.message);

    const { data: historyRows, error: historyError } = await supabase
      .from("entries")
      .select("description, counterparty, account, nature, behavior, area")
      .eq("client_id", data.clientId)
      .in("status", ["confirmado", "auto"])
      .not("account", "is", null)
      .limit(5000);
    if (historyError) throw new Error(historyError.message);

    const { data: trainingRows, error: trainingError } = await supabase
      .from("training_examples")
      .select("history_key, account, nature, behavior, area")
      .eq("client_id", data.clientId)
      .eq("active", true)
      .limit(5000);
    if (trainingError) throw new Error(trainingError.message);

    const candidates: HistoryCandidate[] = [];

    for (const row of historyRows ?? []) {
      const key = historyKey({ description: row.description, counterparty: row.counterparty });
      if (!key || !row.account) continue;
      candidates.push({
        key,
        account: row.account,
        nature: row.nature,
        behavior: row.behavior,
        area: row.area,
        source: "entry",
      });
    }

    for (const row of trainingRows ?? []) {
      if (!row.history_key || !row.account) continue;
      candidates.push({
        key: row.history_key,
        account: row.account,
        nature: row.nature,
        behavior: row.behavior,
        area: row.area,
        source: "training",
      });
    }

    const { history, conflicts } = mergeHistoryCandidates(candidates);

    const { data: pendingRows, error: pendingError } = await supabase
      .from("entries")
      .select("id, description, counterparty, original_category, amount, account, nature, behavior, area, status")
      .eq("client_id", data.clientId)
      .eq("status", "pendente")
      .limit(5000);
    if (pendingError) throw new Error(pendingError.message);

    let automatic = 0;
    let suggested = 0;
    let structuredSuggested = 0;
    let unchanged = 0;
    const auditRows: TablesInsert<"classification_audit">[] = [];

    for (const row of pendingRows ?? []) {
      const rawEntry = {
        description: row.description,
        counterparty: row.counterparty,
        original_category: row.original_category,
        amount: Number(row.amount),
      };
      const result = classifyEntry(rawEntry, {
        clientId: data.clientId,
        segment: client.segment,
        rules: (rules ?? []) as unknown as RuleLike[],
        history,
      });

      let next = result;
      if (result.status === "pendente" || !result.account) {
        const key = historyKey({ description: row.description, counterparty: row.counterparty });
        const structured = key ? findStructuredTrainingMatch(rawEntry, history, key) : null;
        if (!structured) {
          unchanged += 1;
          continue;
        }

        next = {
          account: structured.history.account,
          nature: structured.history.nature,
          behavior: structured.history.behavior,
          area: structured.history.area,
          confidence: STRUCTURED_TRAINING_CONFIDENCE,
          source: STRUCTURED_TRAINING_SOURCE,
          status: "sugerido",
        };
        structuredSuggested += 1;
      }

      const { error: updateError } = await supabase
        .from("entries")
        .update({
          account: next.account,
          nature: next.nature,
          behavior: next.behavior,
          area: next.area,
          confidence: next.confidence,
          classification_source: next.source,
          status: next.status,
          excluded_from_dre: next.nature === "excluido",
        })
        .eq("client_id", data.clientId)
        .eq("id", row.id)
        .eq("status", "pendente");
      if (updateError) throw new Error(updateError.message);

      if (next.status === "auto") automatic += 1;
      else suggested += 1;

      auditRows.push({
        client_id: data.clientId,
        entry_id: row.id,
        user_id: context.userId,
        previous: {
          account: row.account,
          nature: row.nature,
          behavior: row.behavior,
          area: row.area,
          status: row.status,
        } as Json,
        next: {
          account: next.account,
          nature: next.nature,
          behavior: next.behavior,
          area: next.area,
          status: next.status,
        } as Json,
        source: next.source,
        confidence: next.confidence,
        became_rule: false,
      });
    }

    for (let i = 0; i < auditRows.length; i += 400) {
      const { error: auditError } = await supabase
        .from("classification_audit")
        .insert(auditRows.slice(i, i + 400));
      if (auditError) throw new Error(auditError.message);
    }

    return {
      analyzed: pendingRows?.length ?? 0,
      automatic,
      suggested,
      structuredSuggested,
      remaining: unchanged,
      historyExamples: history.length,
      historyConflicts: conflicts.size,
    };
  });
