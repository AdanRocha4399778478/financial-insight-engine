import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface ManualEntryValue {
  accountId: string;
  period: string;
  value: number;
  updatedAt: string;
  updatedBy: string | null;
}

interface ManualEntryRow {
  account_id: string;
  period: string;
  value: number | string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * Converte as linhas cruas do banco para o formato usado pela UI. Nunca
 * preenche um mês ausente com zero — se não há linha para uma conta+período,
 * ela simplesmente não aparece no resultado. A UI deve tratar "ausente" como
 * "sem lançamento", não como R$ 0,00 (princípio de CLAUDE.md: pendência
 * explícita é sempre preferível a um valor inventado).
 */
export function toManualEntryValues(rows: ManualEntryRow[]): ManualEntryValue[] {
  return rows.map((row) => ({
    accountId: row.account_id,
    period: row.period,
    value: Number(row.value),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }));
}

/**
 * Garante que balance_manual_entries.client_id nunca é aceito solto do
 * formulário: o client_id gravado é sempre o da balance_accounts referenciada
 * por account_id, nunca o que veio no payload. Aqui só validamos que os dois
 * batem antes de prosseguir — quem grava usa accountClientId, não
 * requestedClientId (ver handler de saveBalanceManualEntry).
 */
export function assertAccountBelongsToClient(accountClientId: string, requestedClientId: string): void {
  if (accountClientId !== requestedClientId) {
    throw new Error("Esta conta pertence a outro cliente.");
  }
}

export const listBalanceManualEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        from: z.string().min(10).max(10),
        to: z.string().min(10).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("balance_manual_entries")
      .select("account_id, period, value, updated_at, updated_by")
      .eq("client_id", data.clientId)
      .gte("period", data.from)
      .lte("period", data.to);
    if (error) throw new Error(error.message);
    return toManualEntryValues(rows ?? []);
  });

export const saveBalanceManualEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        accountId: z.string().uuid(),
        period: z.string().min(10).max(10),
        value: z.number(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: account, error: accountError } = await context.supabase
      .from("balance_accounts")
      .select("id, client_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (!account) throw new Error("Conta patrimonial não encontrada ou sem permissão de acesso.");

    assertAccountBelongsToClient(account.client_id, data.clientId);

    const { error } = await context.supabase.from("balance_manual_entries").upsert(
      {
        client_id: account.client_id,
        account_id: data.accountId,
        period: data.period,
        value: data.value,
        updated_by: context.userId,
      },
      { onConflict: "account_id,period" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
