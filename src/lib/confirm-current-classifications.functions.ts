import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fingerprint, historyKey } from "./classify";

export const confirmCurrentClassifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        entryIds: z.array(z.string().uuid()).min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: before, error: beforeError } = await supabase
      .from("entries")
      .select(
        "id, description, counterparty, original_category, account, nature, behavior, area, statement_type, balance_group, status, classification_source, confidence",
      )
      .eq("client_id", data.clientId)
      .in("id", data.entryIds)
      .eq("status", "auto")
      .not("account", "is", null);
    if (beforeError) throw new Error(beforeError.message);
    if (!before?.length) {
      return { updated: 0, learning: { learned: 0, duplicates: 0, conflicts: 0 } };
    }

    const eligibleIds = before.map((row) => row.id);
    const { data: updated, error } = await supabase
      .from("entries")
      .update({ status: "confirmado", confidence: 1 })
      .eq("client_id", data.clientId)
      .eq("status", "auto")
      .in("id", eligibleIds)
      .select("id");
    if (error) throw new Error(error.message);

    const updatedIds = new Set((updated ?? []).map((row) => row.id));
    const confirmedRows = before.filter((row) => updatedIds.has(row.id));

    const auditRows = confirmedRows.map((row) => ({
      client_id: data.clientId,
      entry_id: row.id,
      user_id: context.userId,
      previous: {
        account: row.account,
        nature: row.nature,
        behavior: row.behavior,
        area: row.area,
        statement_type: row.statement_type,
        balance_group: row.balance_group,
        status: row.status,
        classification_source: row.classification_source,
        confidence: row.confidence,
      },
      next: {
        account: row.account,
        nature: row.nature,
        behavior: row.behavior,
        area: row.area,
        statement_type: row.statement_type,
        balance_group: row.balance_group,
        status: "confirmado",
        classification_source: row.classification_source,
        confidence: 1,
      },
      source: "confirmacao_classificacao_atual",
      confidence: 1,
      became_rule: false,
    }));

    if (auditRows.length > 0) {
      const { error: auditError } = await supabase.from("classification_audit").insert(auditRows);
      if (auditError) throw new Error(auditError.message);
    }

    const uniqueByKey = new Map<string, (typeof confirmedRows)[number]>();
    for (const row of confirmedRows) {
      const key = historyKey({ description: row.description, counterparty: row.counterparty });
      if (!key || uniqueByKey.has(key)) continue;
      uniqueByKey.set(key, row);
    }

    let learned = 0;
    let duplicates = 0;
    let conflicts = 0;
    const keys = [...uniqueByKey.keys()];

    if (keys.length > 0) {
      const { data: existing, error: existingError } = await supabase
        .from("training_examples")
        .select("history_key, account, nature, behavior, area, statement_type, balance_group")
        .eq("client_id", data.clientId)
        .eq("active", true)
        .in("history_key", keys)
        .limit(50000);
      if (existingError) throw new Error(existingError.message);

      const byKey = new Map<string, typeof existing>();
      for (const row of existing ?? []) {
        const list = byKey.get(row.history_key) ?? [];
        list.push(row);
        byKey.set(row.history_key, list);
      }

      const payload = [];
      for (const [key, row] of uniqueByKey) {
        const statementType = row.statement_type === "balanco" ? "balanco" : "resultado";
        const balanceGroup = statementType === "balanco" ? row.balance_group : null;
        const prior = byKey.get(key) ?? [];

        const same = prior.some(
          (item) =>
            item.statement_type === statementType &&
            item.balance_group === balanceGroup &&
            item.account === row.account &&
            item.nature === row.nature &&
            item.behavior === row.behavior &&
            item.area === row.area,
        );
        const divergent = prior.some(
          (item) =>
            item.statement_type !== statementType ||
            item.balance_group !== balanceGroup ||
            item.account !== row.account ||
            item.nature !== row.nature ||
            item.behavior !== row.behavior ||
            item.area !== row.area,
        );

        if (same && !divergent) {
          duplicates += 1;
          continue;
        }
        if (divergent) {
          conflicts += 1;
          continue;
        }

        payload.push({
          client_id: data.clientId,
          description: row.description,
          counterparty: row.counterparty,
          original_category: row.original_category,
          history_key: key,
          account: row.account!,
          nature: row.nature,
          behavior: row.behavior,
          area: row.area,
          statement_type: statementType,
          balance_group: balanceGroup,
          source_type: "human_confirmation_auto",
          source_file: null,
          source_row_number: null,
          fingerprint: fingerprint([
            data.clientId,
            key,
            statementType,
            balanceGroup ?? "",
            row.account ?? "",
            row.nature,
            row.behavior,
            row.area ?? "",
          ]),
          active: true,
          created_by: context.userId,
        });
      }

      if (payload.length > 0) {
        const { error: learningError } = await supabase.from("training_examples").insert(payload);
        if (learningError) throw new Error(learningError.message);
        learned = payload.length;
      }
    }

    return { updated: updatedIds.size, learning: { learned, duplicates, conflicts } };
  });
