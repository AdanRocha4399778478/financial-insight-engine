import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { historyKey } from "./classify";

export const listPendingIdentitySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ clientId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(30) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("entries")
      .select("id, description, counterparty, amount")
      .eq("client_id", data.clientId)
      .eq("status", "pendente")
      .limit(5000);
    if (error) throw new Error(error.message);

    const grouped = new Map<string, {
      historyKey: string;
      count: number;
      totalAmount: number;
      sampleDescription: string;
      entryIds: string[];
    }>();

    for (const row of rows ?? []) {
      const key = historyKey({ description: row.description, counterparty: row.counterparty });
      if (!key) continue;
      const current = grouped.get(key) ?? {
        historyKey: key,
        count: 0,
        totalAmount: 0,
        sampleDescription: row.description,
        entryIds: [],
      };
      current.count += 1;
      current.totalAmount += Math.abs(Number(row.amount) || 0);
      current.entryIds.push(row.id);
      grouped.set(key, current);
    }

    const items = [...grouped.values()].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.totalAmount - a.totalAmount;
    });

    const totalPending = rows?.length ?? 0;
    const totalIdentities = items.length;
    const top = items.slice(0, data.limit);
    const topOccurrences = top.reduce((sum, item) => sum + item.count, 0);

    return {
      totalPending,
      totalIdentities,
      topOccurrences,
      topCoveragePct: totalPending > 0 ? Number(((topOccurrences / totalPending) * 100).toFixed(1)) : 0,
      items: top,
    };
  });
