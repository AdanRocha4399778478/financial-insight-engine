import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BALANCE_GROUPS } from "./accounting";
import { fingerprint, historyKey } from "./classify";

const balanceGroupEnum = z.enum(BALANCE_GROUPS as [string, ...string[]]);

export const classifyBalanceEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        entryIds: z.array(z.string().uuid()).min(1).max(2000),
        account: z.string().trim().min(1).max(120),
        balanceGroup: balanceGroupEnum,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: before, error: beforeError } = await context.supabase
      .from("entries")
      .select(
        "id, description, counterparty, original_category, account, nature, behavior, area, status, statement_type, balance_group",
      )
      .eq("client_id", data.clientId)
      .in("id", data.entryIds);
    if (beforeError) throw new Error(beforeError.message);
    if (!before?.length) throw new Error("Nenhum lançamento encontrado para atualizar.");

    const { data: updatedRows, error } = await context.supabase
      .from("entries")
      .update({
        account: data.account,
        statement_type: "balanco",
        balance_group: data.balanceGroup,
        nature: "nao_definido",
        behavior: "nao_definido",
        area: null,
        status: "confirmado",
        confidence: 1,
        classification_source: "confirmacao_humana_balanco",
        excluded_from_dre: true,
      })
      .eq("client_id", data.clientId)
      .in("id", data.entryIds)
      .select("id");
    if (error) throw new Error(error.message);

    const updatedIds = new Set((updatedRows ?? []).map((row) => row.id));
    const confirmedRows = before.filter((row) => updatedIds.has(row.id));

    const audit = confirmedRows.map((row) => ({
      client_id: data.clientId,
      entry_id: row.id,
      user_id: context.userId,
      previous: {
        account: row.account,
        nature: row.nature,
        behavior: row.behavior,
        area: row.area,
        status: row.status,
        statement_type: row.statement_type,
        balance_group: row.balance_group,
      },
      next: {
        account: data.account,
        status: "confirmado",
        statement_type: "balanco",
        balance_group: data.balanceGroup,
      },
      source: "confirmacao_humana_balanco",
      confidence: 1,
      became_rule: false,
    }));

    if (audit.length > 0) {
      const { error: auditError } = await context.supabase.from("classification_audit").insert(audit);
      if (auditError) throw new Error(auditError.message);
    }

    const uniqueByKey = new Map<
      string,
      { description: string; counterparty: string | null; original_category: string | null }
    >();
    for (const row of confirmedRows) {
      const key = historyKey({ description: row.description, counterparty: row.counterparty });
      if (!key || uniqueByKey.has(key)) continue;
      uniqueByKey.set(key, {
        description: row.description,
        counterparty: row.counterparty,
        original_category: row.original_category,
      });
    }

    let learned = 0;
    let duplicates = 0;
    let conflicts = 0;

    const keys = [...uniqueByKey.keys()];
    if (keys.length > 0) {
      const { data: existing, error: existingError } = await context.supabase
        .from("training_examples")
        .select("history_key, account, statement_type, balance_group")
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
        const prior = byKey.get(key) ?? [];
        const same = prior.some(
          (item) =>
            item.statement_type === "balanco" &&
            item.balance_group === data.balanceGroup &&
            item.account === data.account,
        );
        const divergent = prior.some(
          (item) =>
            item.statement_type !== "balanco" ||
            item.balance_group !== data.balanceGroup ||
            item.account !== data.account,
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
          account: data.account,
          nature: "nao_definido" as const,
          behavior: "nao_definido" as const,
          area: null,
          statement_type: "balanco" as const,
          balance_group: data.balanceGroup,
          source_type: "human_confirmation_balance",
          source_file: null,
          source_row_number: null,
          fingerprint: fingerprint([
            data.clientId,
            key,
            "balanco",
            data.balanceGroup,
            data.account,
          ]),
          active: true,
          created_by: context.userId,
        });
      }

      if (payload.length > 0) {
        const { error: learningError } = await context.supabase
          .from("training_examples")
          .insert(payload);
        if (learningError) throw new Error(learningError.message);
        learned = payload.length;
      }
    }

    return {
      updated: updatedIds.size,
      learning: { learned, duplicates, conflicts },
    };
  });
