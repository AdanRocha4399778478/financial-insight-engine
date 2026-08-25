import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
        "id, account, nature, behavior, area, statement_type, balance_group, status, classification_source, confidence",
      )
      .eq("client_id", data.clientId)
      .in("id", data.entryIds)
      .eq("status", "auto")
      .not("account", "is", null);
    if (beforeError) throw new Error(beforeError.message);
    if (!before?.length) return { updated: 0 };

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
    const auditRows = before
      .filter((row) => updatedIds.has(row.id))
      .map((row) => ({
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

    return { updated: updatedIds.size };
  });
