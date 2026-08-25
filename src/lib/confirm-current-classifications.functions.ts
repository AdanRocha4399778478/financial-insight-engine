import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalize } from "./classify";

/**
 * Confirma lançamentos preservando individualmente a classificação atual de cada um.
 * Nunca aplica uma classificação comum ao lote.
 */
export const confirmCurrentClassifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        entryIds: z.array(z.string().uuid()).min(1).max(2000),
        learn: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: rows, error } = await supabase
      .from("entries")
      .select("id, account, nature, behavior, area, description, counterparty")
      .eq("client_id", data.clientId)
      .in("id", data.entryIds)
      .not("account", "is", null);
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Nenhum lançamento classificado encontrado para confirmar.");

    const ids = rows.map((r) => r.id);
    const { error: updateError } = await supabase
      .from("entries")
      .update({ status: "confirmado", confidence: 1 })
      .eq("client_id", data.clientId)
      .in("id", ids);
    if (updateError) throw new Error(updateError.message);

    const learning = { learned: 0, existing: 0, conflicted: 0 };

    if (data.learn) {
      const { data: existingRules } = await supabase
        .from("rules")
        .select("pattern, match_field, account, nature, behavior, area")
        .eq("client_id", data.clientId);

      const seen = new Map<string, { account: string; nature: string; behavior: string; area: string | null }>();
      for (const rule of existingRules ?? []) {
        seen.set(`${rule.match_field}:${normalize(rule.pattern)}`, {
          account: rule.account ?? "",
          nature: String(rule.nature),
          behavior: String(rule.behavior),
          area: rule.area ?? null,
        });
      }

      for (const row of rows) {
        const pattern = normalize(row.description).split(" ").slice(0, 3).join(" ");
        if (!pattern) continue;
        const key = `description:${pattern}`;
        const candidate = {
          account: row.account ?? "",
          nature: String(row.nature),
          behavior: String(row.behavior),
          area: row.area ?? null,
        };
        const found = seen.get(key);
        if (found) {
          const same =
            found.account === candidate.account &&
            found.nature === candidate.nature &&
            found.behavior === candidate.behavior &&
            found.area === candidate.area;
          if (same) learning.existing += 1;
          else learning.conflicted += 1;
          continue;
        }
        const { error: insertError } = await supabase.from("rules").insert({
          client_id: data.clientId,
          match_field: "description",
          pattern,
          account: candidate.account,
          nature: row.nature as never,
          behavior: row.behavior as never,
          area: candidate.area,
          confirmed: true,
          created_by: context.userId,
        });
        if (insertError) {
          learning.conflicted += 1;
          continue;
        }
        seen.set(key, candidate);
        learning.learned += 1;
      }
    }

    return { updated: ids.length, learning };
  });
