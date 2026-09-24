import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDreData } from "@/lib/dre.functions";
import {
  brl,
  buildDre,
  buildIndicators,
  monthLabel,
  pct,
  type Behavior,
  type DreRow,
  type Nature,
} from "@/lib/finance";
import { useRangeFilter, type RangeShortcut } from "@/hooks/use-range-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/clientes/$clientId/indicadores")({
  head: () => ({
    meta: [
      { title: "Indicadores financeiros — Resultados S/A" },
      {
        name: "description",
        content: "Margens, EBITDA, ponto de equilíbrio e margem de segurança calculados sobre base validada.",
      },
      { property: "og:title", content: "Indicadores financeiros — Resultados S/A" },
      { property: "og:description", content: "Margens, EBITDA e ponto de equilíbrio do cliente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IndicatorsPage,
});

const SHORTCUT_LABEL: Record<RangeShortcut, string> = {
  "closed-month": "Mês fechado",
  "3m": "3 meses",
  "6m": "6 meses",
  year: "Ano",
};

const SHORTCUTS: RangeShortcut[] = ["closed-month", "3m", "6m", "year"];

function IndicatorsPage() {
  const { clientId } = Route.useParams();
  const fetchDre = useServerFn(getDreData);
  const rangeFilter = useRangeFilter(clientId);
  const range = rangeFilter.range;

  const dre = useQuery({
    queryKey: ["dre", clientId, range.from, range.to, "all"],
    queryFn: () =>
      fetchDre({ data: { clientId, from: range.from, to: range.to, dimension: null } }),
  });

  const isLoading = dre.isLoading;
  const rows = dre.data?.rows ?? [];
  const hasData = rows.length > 0;

  const toDreRow = (r: (typeof rows)[number]): DreRow => ({
    nature: r.nature as Nature,
    behavior: r.behavior as Behavior,
    amount: Number(r.amount),
    account: r.account,
    excluded_from_dre: r.excluded_from_dre ?? false,
  });

  const indicators = useMemo(
    () => buildIndicators(buildDre(rows.map(toDreRow)), hasData),
    [rows, hasData],
  );

  const monthly = useMemo(() => {
    const buckets = new Map<string, DreRow[]>();
    for (const row of rows) {
      const key = row.entry_date.slice(0, 7);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(toDreRow(row));
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, list]) => {
        const d = buildDre(list);
        return {
          mes: monthLabel(key),
          receita: Number(d.receitaLiquida.toFixed(2)),
          ebitda: Number(d.ebitda.toFixed(2)),
          resultado: Number(d.resultadoLiquido.toFixed(2)),
          margem: d.receitaLiquida > 0 ? Number(((d.resultadoLiquido / d.receitaLiquida) * 100).toFixed(1)) : 0,
        };
      });
  }, [rows]);

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4 mb-4">
          <span className="mr-1 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            Atalho de período
          </span>
          {SHORTCUTS.map((shortcut) => (
            <Button
              key={shortcut}
              variant={rangeFilter.shortcut === shortcut ? "default" : "outline"}
              size="sm"
              onClick={() => rangeFilter.setShortcut(shortcut)}
            >
              {SHORTCUT_LABEL[shortcut]}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="from">De</Label>
            <Input
              id="from"
              type="date"
              value={range.from}
              onChange={(e) => rangeFilter.setRange({ ...range, from: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">Até</Label>
            <Input
              id="to"
              type="date"
              value={range.to}
              onChange={(e) => rangeFilter.setRange({ ...range, to: e.target.value })}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
          Carregando indicadores...
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {indicators.map((indicator) => (
              <div key={indicator.key} className="rounded-lg border border-border bg-card p-6">
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  {indicator.label}
                </p>
                <p className="mt-3 font-display text-2xl font-bold tracking-tight">
                  {indicator.value === null
                    ? "Indisponível"
                    : indicator.format === "currency"
                      ? brl(indicator.value)
                      : pct(indicator.value)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {indicator.reason ?? indicator.hint ?? ""}
                </p>
              </div>
            ))}
          </div>

          {monthly.length > 1 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-6">
                <h2 className="font-display text-sm font-semibold">Receita líquida x EBITDA</h2>
                <div className="mt-6 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={12} />
                      <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={70} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                        }}
                        formatter={(value: number) => brl(value)}
                      />
                      <Bar dataKey="receita" fill="var(--color-muted-foreground)" name="Receita líquida" />
                      <Bar dataKey="ebitda" fill="var(--color-primary)" name="EBITDA" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-6">
                <h2 className="font-display text-sm font-semibold">Margem líquida (%)</h2>
                <div className="mt-6 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="mes" stroke="var(--color-muted-foreground)" fontSize={12} />
                      <YAxis stroke="var(--color-muted-foreground)" fontSize={11} width={50} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                        }}
                        formatter={(value: number) => pct(value)}
                      />
                      <Line
                        type="monotone"
                        dataKey="margem"
                        stroke="var(--color-primary)"
                        strokeWidth={2}
                        dot={false}
                        name="Margem líquida"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {!hasData && (
            <div className="rounded-lg border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
              Sem base validada no período — importe e classifique lançamentos para ver os indicadores.
            </div>
          )}
        </>
      )}
    </div>
  );
}
