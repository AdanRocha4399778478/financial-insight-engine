import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { classifyEntry, fingerprint, historyKey, type RuleLike } from "./classify";
import { mergeHistoryCandidates, type HistoryCandidate } from "./classification-history";
import type { TablesInsert } from "@/integrations/supabase/types";

export const getSavedMapping = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clientId: z.string().uuid(), signature: z.string().max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("column_mappings")
      .select("mapping")
      .eq("client_id", data.clientId)
      .eq("signature", data.signature)
      .maybeSingle();
    return (row?.mapping as Record<string, string> | undefined) ?? null;
  });

const rowSchema = z.object({
  entry_date: z.string().min(8).max(10),
  description: z.string().max(500),
  counterparty: z.string().max(300).nullable(),
  amount: z.number(),
  movement_type: z.string().max(120).nullable(),
  original_category: z.string().max(200).nullable(),
  cost_center: z.string().max(200).nullable(),
  document: z.string().max(120).nullable(),
  raw: z.record(z.string(), z.unknown()),
});

export const commitImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        filename: z.string().max(255),
        periodLabel: z.string().max(60).nullable(),
        signature: z.string().max(4000),
        mapping: z.record(z.string(), z.string()),
        allowDuplicates: z.boolean(),
        rows: z.array(rowSchema).max(20000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, segment")
      .eq("id", data.clientId)
      .maybeSingle();
    if (clientError) throw new Error(clientError.message);
    if (!client) throw new Error("Cliente não encontrado ou sem permissão de acesso.");

    const { data: rules } = await supabase
      .from("rules")
      .select("*")
      .eq("active", true)
      .or(`client_id.eq.${data.clientId},client_id.is.null`);

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

    const historyCandidates: HistoryCandidate[] = [];
    for (const h of historyRows ?? []) {
      const key = historyKey({ description: h.description, counterparty: h.counterparty });
      if (key && h.account) {
        historyCandidates.push({
          key,
          account: h.account,
          nature: h.nature,
          behavior: h.behavior,
          area: h.area,
          source: "entry",
        });
      }
    }
    for (const h of trainingRows ?? []) {
      if (h.history_key && h.account) {
        historyCandidates.push({
          key: h.history_key,
          account: h.account,
          nature: h.nature,
          behavior: h.behavior,
          area: h.area,
          source: "training",
        });
      }
    }

    const { history } = mergeHistoryCandidates(historyCandidates);

    const { data: existing } = await supabase
      .from("entries")
      .select("fingerprint")
      .eq("client_id", data.clientId)
      .limit(50000);
    const seen = new Set((existing ?? []).map((e) => e.fingerprint));

    const { data: importRow, error: importError } = await supabase
      .from("imports")
      .insert({
        client_id: data.clientId,
        filename: data.filename,
        period_label: data.periodLabel,
        mapping: data.mapping,
        total_rows: data.rows.length,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (importError) throw new Error(importError.message);

    let duplicates = 0;
    let pending = 0;
    let auto = 0;
    let suggested = 0;
    const payload: TablesInsert<"entries">[] = [];

    for (const row of data.rows) {
      const fp = fingerprint([
        data.clientId,
        row.entry_date,
        row.amount.toFixed(2),
        row.description,
        row.counterparty,
      ]);
      if (seen.has(fp)) {
        duplicates += 1;
        if (!data.allowDuplicates) continue;
      }
      seen.add(fp);

      const result = classifyEntry(
        {
          description: row.description,
          counterparty: row.counterparty,
          original_category: row.original_category,
          amount: row.amount,
        },
        {
          clientId: data.clientId,
          segment: client.segment,
          rules: (rules ?? []) as unknown as RuleLike[],
          history,
        },
      );

      if (result.status === "auto") auto += 1;
      else if (result.status === "sugerido") suggested += 1;
      else pending += 1;

      payload.push({
        client_id: data.clientId,
        import_id: importRow.id,
        entry_date: row.entry_date,
        description: row.description,
        counterparty: row.counterparty,
        amount: row.amount,
        movement_type: row.movement_type,
        original_category: row.original_category,
        cost_center: row.cost_center,
        document: row.document,
        raw: row.raw as NonNullable<TablesInsert<"entries">["raw"]>,
        fingerprint: data.allowDuplicates ? `${fp}-${payload.length}` : fp,
        account: result.account,
        nature: result.nature,
        behavior: result.behavior,
        area: result.area,
        confidence: result.confidence,
        classification_source: result.source,
        status: result.status,
      });
    }

    for (let i = 0; i < payload.length; i += 400) {
      const chunk = payload.slice(i, i + 400);
      const { error } = await supabase.from("entries").insert(chunk);
      if (error) throw new Error(error.message);
    }

    await supabase
      .from("imports")
      .update({
        valid_rows: payload.length,
        duplicate_rows: duplicates,
        pending_rows: pending,
      })
      .eq("id", importRow.id);

    await supabase.from("column_mappings").upsert(
      { client_id: data.clientId, signature: data.signature, mapping: data.mapping },
      { onConflict: "client_id,signature" },
    );

    return {
      importId: importRow.id,
      inserted: payload.length,
      duplicates,
      auto,
      suggested,
      pending,
    };
  });

export const listImports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("imports")
      .select("*")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ importId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("imports").delete().eq("id", data.importId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
