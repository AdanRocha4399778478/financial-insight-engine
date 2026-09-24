import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { BALANCE_GROUPS, BALANCE_SUBGROUPS } from "./accounting";

const balanceGroupEnum = z.enum(BALANCE_GROUPS as [string, ...string[]]);
const balanceSubgroupEnum = z.enum(BALANCE_SUBGROUPS as [string, ...string[]]);

const balanceAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  balanceGroup: balanceGroupEnum,
  balanceSubgroup: balanceSubgroupEnum.nullable(),
  active: z.boolean(),
});

/**
 * Traduz um erro do Postgres para uma mensagem legível quando é a violação de
 * unicidade (client_id, name) — mesmo princípio que evita "Caminhao HHK"
 * virar conta duplicada de "Caminhão HHK", mas para o plano de contas
 * patrimonial em vez do fingerprint de lançamento.
 */
export function toBalanceAccountSaveError(
  error: { code?: string; message: string } | null,
  name: string,
): Error | null {
  if (!error) return null;
  if (error.code === "23505") {
    return new Error(`Já existe uma conta chamada "${name}" para este cliente.`);
  }
  return new Error(error.message);
}

export const listBalanceAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("balance_accounts")
      .select("*")
      .eq("client_id", data.clientId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveBalanceAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        id: z.string().uuid().nullable(),
        values: balanceAccountSchema,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.values.balanceGroup === "patrimonio_liquido" && data.values.balanceSubgroup !== null) {
      throw new Error("Contas de Patrimônio Líquido não têm circulante/não circulante.");
    }

    const payload = {
      client_id: data.clientId,
      name: data.values.name,
      balance_group: data.values.balanceGroup,
      balance_subgroup: data.values.balanceSubgroup,
      active: data.values.active,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("balance_accounts")
        .update(payload)
        .eq("id", data.id)
        .eq("client_id", data.clientId);
      const friendly = toBalanceAccountSaveError(error, data.values.name);
      if (friendly) throw friendly;
      return { id: data.id };
    }

    const { data: created, error } = await context.supabase
      .from("balance_accounts")
      .insert(payload)
      .select("id")
      .single();
    const friendly = toBalanceAccountSaveError(error, data.values.name);
    if (friendly) throw friendly;
    return { id: created!.id };
  });
