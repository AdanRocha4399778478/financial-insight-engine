import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { fingerprint } from "./classify";
import type { TablesInsert } from "@/integrations/supabase/types";

const factSchema = z.object({
  account_code: z.string().min(1).max(60),
  account_name: z.string().max(200),
  period: z.string().min(10).max(10),
  period_label: z.string().max(40),
  amount: z.number(),
});

/** Importação tipo B: DRE já consolidada. Não gera lançamentos nem fila de classificação. */
export const commitDreImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        filename: z.string().max(255),
        periodLabel: z.string().max(60).nullable(),
        signature: z.string().max(4000),
        mapping: z.record(z.string(), z.string()),
        facts: z.array(factSchema).max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", data.clientId)
      .maybeSingle();
    if (clientError) throw new Error(clientError.message);
    if (!client) throw new Error("Cliente não encontrado ou sem permissão de acesso.");

    const { data: importRow, error: importError } = await supabase
      .from("imports")
      .insert({
        client_id: data.clientId,
        filename: data.filename,
        period_label: data.periodLabel,
        kind: "dre_pronta",
        mapping: data.mapping,
        total_rows: data.facts.length,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (importError) throw new Error(importError.message);

    const payload: TablesInsert<"dre_facts">[] = data.facts.map((f) => ({
      client_id: data.clientId,
      import_id: importRow.id,
      account_code: f.account_code,
      account_name: f.account_name,
      period: f.period,
      period_label: f.period_label,
      amount: f.amount,
      fingerprint: fingerprint([data.clientId, f.account_code, f.period]),
    }));

    for (let i = 0; i < payload.length; i += 400) {
      const { error } = await supabase
        .from("dre_facts")
        .upsert(payload.slice(i, i + 400), { onConflict: "client_id,fingerprint" });
      if (error) throw new Error(error.message);
    }

    const accounts = new Map<string, string>();
    for (const f of data.facts) accounts.set(f.account_code, f.account_name);

    const { data: existingMaps } = await supabase
      .from("account_mappings")
      .select("account_code")
      .eq("client_id", data.clientId);
    const known = new Set((existingMaps ?? []).map((m) => m.account_code));

    const newMaps = [...accounts.entries()]
      .filter(([code]) => !known.has(code))
      .map(([code, name]) => ({
        client_id: data.clientId,
        account_code: code,
        account_name: name,
        created_by: context.userId,
      }));
    if (newMaps.length) {
      const { error } = await supabase
        .from("account_mappings")
        .upsert(newMaps, { onConflict: "client_id,account_code" });
      if (error) throw new Error(error.message);
    }

    await supabase
      .from("imports")
      .update({ valid_rows: payload.length, pending_rows: newMaps.length })
      .eq("id", importRow.id);

    return {
      importId: importRow.id,
      facts: payload.length,
      accounts: accounts.size,
      toMap: newMaps.length,
      periods: [...new Set(data.facts.map((f) => f.period))].length,
    };
  });

export const listAccountMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("account_mappings")
      .select("*")
      .eq("client_id", data.clientId)
      .order("account_code", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveAccountMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        accountCode: z.string().max(60),
        nature: z.string().max(40),
        behavior: z.string().max(40),
        area: z.string().max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("account_mappings")
      .update({
        nature: data.nature as never,
        behavior: data.behavior as never,
        area: data.area,
      })
      .eq("client_id", data.clientId)
      .eq("account_code", data.accountCode);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
