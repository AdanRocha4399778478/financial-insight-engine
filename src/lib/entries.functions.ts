import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { NATURES, BEHAVIORS } from "./finance";
import { normalize, statusFor } from "./classify";
import {
  prepareTrainingBatch,
  type ExistingTrainingExample,
  type TrainingInputRow,
} from "./training-import";

const natureEnum = z.enum(NATURES as [string, ...string[]]);
const behaviorEnum = z.enum(BEHAVIORS as [string, ...string[]]);

const classificationSchema = z.object({
  account: z.string().trim().min(1).max(120),
  nature: natureEnum,
  behavior: behaviorEnum,
  area: z.string().trim().max(80).nullable(),
});

export const listEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        status: z.string().max(20).nullable(),
        search: z.string().max(120).nullable(),
        importId: z.string().uuid().nullable(),
        limit: z.number().min(1).max(500).default(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("entries")
      .select("*")
      .eq("client_id", data.clientId)
      .order("entry_date", { ascending: false })
      .limit(data.limit);

    if (data.status && data.status !== "todos") query = query.eq("status", data.status as never);
    if (data.importId) query = query.eq("import_id", data.importId);
    if (data.search) query = query.or(`description.ilike.%${data.search}%,counterparty.ilike.%${data.search}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { data: counts, error: countError } = await context.supabase
      .from("entries")
      .select("status, id")
      .eq("client_id", data.clientId)
      .limit(50000);
    if (countError) throw new Error(countError.message);

    const summary = { total: 0, auto: 0, sugerido: 0, pendente: 0, confirmado: 0, ignorado: 0 };
    for (const c of counts ?? []) {
      summary.total += 1;
      summary[c.status as keyof typeof summary] += 1;
    }
    return { rows: rows ?? [], summary };
  });

async function writeAudit(
  supabase: { from: (t: string) => any },
  args: {
    clientId: string;
    entryId: string | null;
    userId: string;
    previous: unknown;
    next: unknown;
    source: string;
    confidence: number;
    becameRule: boolean;
  },
) {
  await supabase.from("classification_audit").insert({
    client_id: args.clientId,
    entry_id: args.entryId,
    user_id: args.userId,
    previous: args.previous,
    next: args.next,
    source: args.source,
    confidence: args.confidence,
    became_rule: args.becameRule,
  });
}

async function learnFromConfirmedEntries(
  supabase: { from: (table: string) => any },
  args: {
    clientId: string;
    userId: string;
    rows: Array<{
      description: string;
      counterparty: string | null;
      original_category: string | null;
      account: string | null;
      nature: string;
      behavior: string;
      area: string | null;
    }>;
  },
) {
  const candidates: TrainingInputRow[] = args.rows
    .filter((row) => Boolean(row.account))
    .map((row, index) => ({
      description: row.description,
      counterparty: row.counterparty,
      originalCategory: row.original_category,
      account: row.account!,
      nature: row.nature as TrainingInputRow["nature"],
      behavior: row.behavior as TrainingInputRow["behavior"],
      area: row.area,
      sourceRowNumber: index + 1,
    }));

  if (candidates.length === 0) {
    return { learned: 0, duplicates: 0, conflicts: 0, invalid: 0 };
  }

  const { data: existingRows, error: existingError } = await supabase
    .from("training_examples")
    .select("history_key, account, nature, behavior, area, fingerprint")
    .eq("client_id", args.clientId)
    .eq("active", true)
    .limit(50000);
  if (existingError) throw new Error(existingError.message);

  const existing: ExistingTrainingExample[] = (existingRows ?? []).map((row: any) => ({
    historyKey: row.history_key,
    account: row.account,
    nature: row.nature as ExistingTrainingExample["nature"],
    behavior: row.behavior as ExistingTrainingExample["behavior"],
    area: row.area,
    fingerprint: row.fingerprint,
  }));

  const prepared = prepareTrainingBatch(args.clientId, candidates, existing);
  const payload = prepared.ready.map((row) => ({
    client_id: args.clientId,
    description: row.description,
    counterparty: row.counterparty,
    original_category: row.originalCategory,
    history_key: row.historyKey,
    account: row.account,
    nature: row.nature as never,
    behavior: row.behavior as never,
    area: row.area,
    source_type: "human_confirmation",
    source_file: null,
    source_row_number: null,
    fingerprint: row.fingerprint,
    active: true,
    created_by: args.userId,
  }));

  if (payload.length > 0) {
    const { error: insertError } = await supabase.from("training_examples").insert(payload);
    if (insertError) throw new Error(insertError.message);
  }

  return {
    learned: payload.length,
    duplicates: prepared.duplicatesInBatch.length + prepared.duplicatesExisting.length,
    conflicts: prepared.conflicts.length,
    invalid: prepared.invalid.length,
  };
}

export const classifyEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        entryIds: z.array(z.string().uuid()).min(1).max(2000),
        values: classificationSchema,
        createRule: z.boolean(),
        ruleField: z.enum(["description", "counterparty"]).default("description"),
        rulePattern: z.string().trim().max(200).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: before, error: beforeError } = await supabase
      .from("entries")
      .select("id, account, nature, behavior, area, status, description, counterparty, original_category")
      .eq("client_id", data.clientId)
      .in("id", data.entryIds);
    if (beforeError) throw new Error(beforeError.message);
    if (!before?.length) throw new Error("Nenhum lançamento encontrado para atualizar.");

    const { error } = await supabase
      .from("entries")
      .update({
        account: data.values.account,
        nature: data.values.nature as never,
        behavior: data.values.behavior as never,
        area: data.values.area,
        status: "confirmado",
        confidence: 1,
        classification_source: "confirmacao_humana",
        excluded_from_dre: data.values.nature === "excluido",
      })
      .eq("client_id", data.clientId)
      .in("id", data.entryIds);
    if (error) throw new Error(error.message);

    let ruleId: string | null = null;
    if (data.createRule) {
      const first = before[0]!;
      const pattern =
        data.rulePattern?.trim() ||
        (data.ruleField === "counterparty"
          ? (first.counterparty ?? first.description)
          : normalize(first.description).split(" ").slice(0, 3).join(" "));
      const { data: rule, error: ruleError } = await supabase
        .from("rules")
        .insert({
          client_id: data.clientId,
          match_field: data.ruleField,
          pattern,
          account: data.values.account,
          nature: data.values.nature as never,
          behavior: data.values.behavior as never,
          area: data.values.area,
          confirmed: true,
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (ruleError) throw new Error(ruleError.message);
      ruleId = rule.id;
    }

    for (const row of before) {
      await writeAudit(supabase as never, {
        clientId: data.clientId,
        entryId: row.id,
        userId: context.userId,
        previous: {
          account: row.account,
          nature: row.nature,
          behavior: row.behavior,
          area: row.area,
          status: row.status,
        },
        next: { ...data.values, status: "confirmado" },
        source: "confirmacao_humana",
        confidence: 1,
        becameRule: Boolean(ruleId),
      });
    }

    const learning = await learnFromConfirmedEntries(supabase as never, {
      clientId: data.clientId,
      userId: context.userId,
      rows: before.map((row) => ({
        description: row.description,
        counterparty: row.counterparty,
        original_category: row.original_category,
        account: data.values.account,
        nature: data.values.nature,
        behavior: data.values.behavior,
        area: data.values.area,
      })),
    });

    return { updated: before.length, ruleId, learning };
  });

export const ignoreEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ clientId: z.string().uuid(), entryIds: z.array(z.string().uuid()).min(1).max(2000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("entries")
      .update({ status: "ignorado", excluded_from_dre: true, classification_source: "ignorado_manual" })
      .eq("client_id", data.clientId)
      .in("id", data.entryIds);
    if (error) throw new Error(error.message);
    return { updated: data.entryIds.length };
  });

export const confirmSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ clientId: z.string().uuid(), entryIds: z.array(z.string().uuid()).min(1).max(2000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: before, error: beforeError } = await supabase
      .from("entries")
      .select("id, description, counterparty, original_category, account, nature, behavior, area, status, classification_source, confidence")
      .eq("client_id", data.clientId)
      .in("id", data.entryIds)
      .eq("status", "sugerido")
      .not("account", "is", null);
    if (beforeError) throw new Error(beforeError.message);
    if (!before?.length) return { updated: 0, learning: { learned: 0, duplicates: 0, conflicts: 0, invalid: 0 } };

    const eligibleIds = before.map((row) => row.id);
    const { data: updatedRows, error } = await supabase
      .from("entries")
      .update({ status: "confirmado", confidence: 1 })
      .eq("client_id", data.clientId)
      .eq("status", "sugerido")
      .in("id", eligibleIds)
      .not("account", "is", null)
      .select("id");
    if (error) throw new Error(error.message);

    const updatedIds = new Set((updatedRows ?? []).map((row) => row.id));
    const confirmedRows = before.filter((row) => updatedIds.has(row.id));

    for (const row of confirmedRows) {
      await writeAudit(supabase as never, {
        clientId: data.clientId,
        entryId: row.id,
        userId: context.userId,
        previous: {
          account: row.account,
          nature: row.nature,
          behavior: row.behavior,
          area: row.area,
          status: row.status,
          classification_source: row.classification_source,
          confidence: row.confidence,
        },
        next: {
          account: row.account,
          nature: row.nature,
          behavior: row.behavior,
          area: row.area,
          status: "confirmado",
          classification_source: row.classification_source,
          confidence: 1,
        },
        source: "confirmacao_sugestao",
        confidence: 1,
        becameRule: false,
      });
    }

    const learning = await learnFromConfirmedEntries(supabase as never, {
      clientId: data.clientId,
      userId: context.userId,
      rows: confirmedRows.map((row) => ({
        description: row.description,
        counterparty: row.counterparty,
        original_category: row.original_category,
        account: row.account,
        nature: row.nature,
        behavior: row.behavior,
        area: row.area,
      })),
    });

    return { updated: updatedIds.size, learning };
  });

export const listRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("rules")
      .select("*")
      .or(`client_id.eq.${data.clientId},client_id.is.null`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setRuleActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ruleId: z.string().uuid(), active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("rules")
      .update({ active: data.active })
      .eq("id", data.ruleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("classification_audit")
      .select("*")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Sugestão por IA — último recurso do motor, sempre com confirmação humana (spec §11/§12). */
export const suggestWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ clientId: z.string().uuid(), entryIds: z.array(z.string().uuid()).min(1).max(60) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA indisponível: chave não configurada.");

    const supabase = context.supabase;
    const { data: client } = await supabase
      .from("clients")
      .select("name, industry, segment, revenue_model")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client) throw new Error("Cliente não encontrado ou sem permissão de acesso.");

    const { data: entries, error } = await supabase
      .from("entries")
      .select("id, description, counterparty, original_category, amount")
      .eq("client_id", data.clientId)
      .in("id", data.entryIds);
    if (error) throw new Error(error.message);
    if (!entries?.length) return { updated: 0 };

    const prompt = `Você é analista financeiro da Resultados S/A classificando lançamentos gerenciais.
Cliente: ${client.name} | Ramo: ${client.industry ?? "não informado"} | Segmento: ${client.segment ?? "não informado"} | Modelo de receita: ${client.revenue_model ?? "não informado"}.
O ramo influencia a sugestão mas não decide sozinho. Se houver dúvida real, use confidence baixa (< 0.5).
Naturezas válidas: ${NATURES.join(", ")}.
Comportamentos válidos: ${BEHAVIORS.join(", ")}.
Responda SOMENTE um array JSON com objetos {id, account, nature, behavior, area, confidence}.
"account" é a conta gerencial em português (ex.: Combustível, Salários, Comissão, Energia, Frete, Taxa de cartão).
"confidence" é número entre 0 e 1.

Lançamentos:
${entries.map((e) => `- id=${e.id} | descrição="${e.description}" | fornecedor="${e.counterparty ?? ""}" | categoria original="${e.original_category ?? ""}" | valor=${e.amount}`).join("\n")}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`AI gateway falhou [${response.status}]: ${body}`);
      if (response.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
      if (response.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
      throw new Error("Não foi possível obter sugestões da IA agora.");
    }

    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = payload.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("A IA não retornou sugestões utilizáveis.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error("A IA não retornou sugestões utilizáveis.");
    }

    const suggestionSchema = z.array(
      z.object({
        id: z.string(),
        account: z.string().max(120),
        nature: natureEnum,
        behavior: behaviorEnum,
        area: z.string().max(80).nullable().optional(),
        confidence: z.number(),
      }),
    );
    const suggestions = suggestionSchema.safeParse(parsed);
    if (!suggestions.success) throw new Error("A IA não retornou sugestões no formato esperado.");

    const validIds = new Set(entries.map((e) => e.id));
    let updated = 0;
    for (const s of suggestions.data) {
      if (!validIds.has(s.id)) continue;
      // IA nunca classifica automaticamente: teto de confiança abaixo do limite automático.
      const confidence = Math.min(Math.max(s.confidence, 0), 0.8);
      const status = statusFor(confidence) === "auto" ? "sugerido" : statusFor(confidence);
      const { error: updateError } = await supabase
        .from("entries")
        .update({
          account: s.account,
          nature: s.nature as never,
          behavior: s.behavior as never,
          area: s.area ?? null,
          confidence,
          classification_source: "ia",
          status: status as never,
        })
        .eq("client_id", data.clientId)
        .eq("id", s.id);
      if (!updateError) updated += 1;
    }
    return { updated };
  });
