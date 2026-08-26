import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json, TablesInsert } from "@/integrations/supabase/types";

export const REJECTED_SUGGESTION_SOURCE = "sugestao_rejeitada";

export const rejectSuggestions = createServerFn({ method: "POST" })
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
        "id, account, nature, behavior, area, status, statement_type, balance_group, classification_source, confidence, excluded_from_dre",
      )
      .eq("client_id", data.clientId)
      .in("id", data.entryIds)
      .eq("status", "sugerido");
    if (beforeError) throw new Error(beforeError.message);
    if (!before?.length) return { updated: 0 };

    const eligibleIds = before.map((row) => row.id);
    const { data: updatedRows, error: updateError } = await supabase
      .from("entries")
      .update({
        account: null,
        nature: "nao_definido",
        behavior: "nao_definido",
        area: null,
        balance_group: null,
        confidence: 0,
        classification_source: REJECTED_SUGGESTION_SOURCE,
        status: "pendente",
        excluded_from_dre: false,
      })
      .eq("client_id", data.clientId)
      .eq("status", "sugerido")
      .in("id", eligibleIds)
      .select("id");
    if (updateError) throw new Error(updateError.message);

    const updatedIds = new Set((updatedRows ?? []).map((row) => row.id));
    const auditRows: TablesInsert<"classification_audit">[] = before
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
          status: row.status,
          statement_type: row.statement_type,
          balance_group: row.balance_group,
          classification_source: row.classification_source,
          confidence: row.confidence,
          excluded_from_dre: row.excluded_from_dre,
        } as Json,
        next: {
          account: null,
          nature: "nao_definido",
          behavior: "nao_definido",
          area: null,
          status: "pendente",
          statement_type: row.statement_type,
          balance_group: null,
          classification_source: REJECTED_SUGGESTION_SOURCE,
          confidence: 0,
          excluded_from_dre: false,
        } as Json,
        source: "rejeicao_sugestao",
        confidence: 0,
        became_rule: false,
      }));

    if (auditRows.length > 0) {
      const { error: auditError } = await supabase.from("classification_audit").insert(auditRows);
      if (auditError) throw new Error(auditError.message);
    }

    return { updated: updatedIds.size };
  });
