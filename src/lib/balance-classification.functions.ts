import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BALANCE_GROUPS } from "./accounting";

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
      .select("id, account, nature, behavior, area, status, statement_type, balance_group")
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
    const audit = before
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

    return { updated: updatedIds.size };
  });
