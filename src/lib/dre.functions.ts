import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const periodSchema = z.object({
  clientId: z.string().uuid(),
  from: z.string().min(10).max(10),
  to: z.string().min(10).max(10),
  dimension: z.string().max(120).nullable(),
});

/** Somente base validada entra na DRE: pendentes ficam de fora (spec §24 - Teste D). */
export const getDreData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => periodSchema.parse(input))
  .handler(async ({ data, context }) => {
    const base = () =>
      context.supabase
        .from("entries")
        .select("entry_date, amount, nature, behavior, account, area, excluded_from_dre, status, cost_center")
        .eq("client_id", data.clientId)
        .in("status", ["auto", "confirmado", "sugerido"])
        .limit(50000);

    let query = base().gte("entry_date", data.from).lte("entry_date", data.to);
    if (data.dimension) query = query.eq("cost_center", data.dimension);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { data: pendingRows } = await context.supabase
      .from("entries")
      .select("id")
      .eq("client_id", data.clientId)
      .eq("status", "pendente")
      .gte("entry_date", data.from)
      .lte("entry_date", data.to)
      .limit(50000);

    const { data: dimensionRows } = await context.supabase
      .from("entries")
      .select("cost_center")
      .eq("client_id", data.clientId)
      .not("cost_center", "is", null)
      .limit(5000);

    // Importações tipo "DRE pronta": contas já mapeadas ao Plano Gerencial entram na DRE.
    const { data: facts } = await context.supabase
      .from("dre_facts")
      .select("period, amount, account_code, account_name")
      .eq("client_id", data.clientId)
      .gte("period", data.from)
      .lte("period", data.to)
      .limit(50000);

    const { data: maps } = await context.supabase
      .from("account_mappings")
      .select("account_code, account_name, nature, behavior, area, active")
      .eq("client_id", data.clientId)
      .limit(20000);

    const mapByCode = new Map((maps ?? []).map((m) => [m.account_code, m]));
    const factRows = (facts ?? []).flatMap((f) => {
      const m = mapByCode.get(f.account_code);
      if (!m || !m.active || m.nature === "nao_definido") return [];
      return [
        {
          entry_date: f.period,
          amount: Number(f.amount),
          nature: m.nature,
          behavior: m.behavior,
          account: m.account_name || f.account_name,
          area: m.area,
          excluded_from_dre: false,
          status: "confirmado" as const,
          cost_center: null as string | null,
        },
      ];
    });

    const unmappedAccounts = new Set(
      (facts ?? [])
        .filter((f) => {
          const m = mapByCode.get(f.account_code);
          return !m || m.nature === "nao_definido";
        })
        .map((f) => f.account_code),
    ).size;

    return {
      rows: [...(rows ?? []), ...factRows],
      unmappedAccounts,
      pendingCount: pendingRows?.length ?? 0,
      dimensions: [...new Set((dimensionRows ?? []).map((d) => d.cost_center!).filter(Boolean))].sort(),
    };
  });

export const getComparisonData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        ranges: z
          .array(z.object({ key: z.string().max(40), from: z.string(), to: z.string() }))
          .max(4),
        dimension: z.string().max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const result: Record<
      string,
      { entry_date: string; amount: number; nature: string; behavior: string; account: string | null }[]
    > = {};
    for (const range of data.ranges) {
      let query = context.supabase
        .from("entries")
        .select("entry_date, amount, nature, behavior, account")
        .eq("client_id", data.clientId)
        .in("status", ["auto", "confirmado", "sugerido"])
        .gte("entry_date", range.from)
        .lte("entry_date", range.to)
        .limit(50000);
      if (data.dimension) query = query.eq("cost_center", data.dimension);
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);
      result[range.key] = rows ?? [];
    }
    return result;
  });

/** Drill-down: do valor agregado até os lançamentos de origem (spec §18). */
export const drilldownEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        from: z.string(),
        to: z.string(),
        nature: z.string().max(40),
        account: z.string().max(120).nullable(),
        dimension: z.string().max(120).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("entries")
      .select("id, entry_date, description, counterparty, amount, account, area, status, confidence, classification_source, original_category")
      .eq("client_id", data.clientId)
      .eq("nature", data.nature as never)
      .in("status", ["auto", "confirmado", "sugerido"])
      .gte("entry_date", data.from)
      .lte("entry_date", data.to)
      .order("entry_date", { ascending: false })
      .limit(500);
    if (data.account) query = query.eq("account", data.account);
    if (data.dimension) query = query.eq("cost_center", data.dimension);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getClientMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: entries } = await context.supabase
      .from("entries")
      .select("status, classification_source")
      .eq("client_id", data.clientId)
      .limit(50000);
    const { data: rules } = await context.supabase
      .from("rules")
      .select("id")
      .eq("client_id", data.clientId);
    const list = entries ?? [];
    const auto = list.filter((e) => e.status === "auto").length;
    const reused = list.filter(
      (e) =>
        e.classification_source === "regra_confirmada_cliente" ||
        e.classification_source === "regra_cliente" ||
        e.classification_source === "historico_cliente",
    ).length;
    return {
      total: list.length,
      auto,
      pending: list.filter((e) => e.status === "pendente").length,
      autoRate: list.length ? (auto / list.length) * 100 : 0,
      reused,
      rules: rules?.length ?? 0,
    };
  });
