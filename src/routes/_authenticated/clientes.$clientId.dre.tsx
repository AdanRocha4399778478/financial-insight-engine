import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { drilldownEntries, getDreData } from "@/lib/dre.functions";
import {
  NATURE_LABEL,
  brl,
  buildDre,
  pct,
  type Behavior,
  type DreRow,
  type Nature,
} from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/clientes/$clientId/dre")({
  head: () => ({
    meta: [
      { title: "DRE gerencial — Resultados S/A" },
      {
        name: "description",
        content: "Demonstrativo gerencial com margens, EBITDA e drill-down até o lançamento de origem.",
      },
      { property: "og:title", content: "DRE gerencial — Resultados S/A" },
      { property: "og:description", content: "Resultado gerencial com drill-down por conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DrePage,
});

const ALL = "__all__";

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function DrePage() {
  const { clientId } = Route.useParams();
  const fetchDre = useServerFn(getDreData);
  const fetchDrill = useServerFn(drilldownEntries);

  const [range, setRange] = useState(defaultRange);
  const [dimension, setDimension] = useState(ALL);
  const [drill, setDrill] = useState<{ nature: Nature; account: string | null; label: string } | null>(
    null,
  );

  const dre = useQuery({
    queryKey: ["dre", clientId, range.from, range.to, dimension],
    queryFn: () =>
      fetchDre({
        data: {
          clientId,
          from: range.from,
          to: range.to,
          dimension: dimension === ALL ? null : dimension,
        },
      }),
  });

  const drillQuery = useQuery({
    queryKey: ["drill", clientId, drill?.nature, drill?.account, range.from, range.to, dimension],
    enabled: Boolean(drill),
    queryFn: () =>
      fetchDrill({
        data: {
          clientId,
          from: range.from,
          to: range.to,
          nature: drill!.nature,
          account: drill!.account,
          dimension: dimension === ALL ? null : dimension,
        },
      }),
  });

  const result = useMemo(() => {
    const rows: DreRow[] = (dre.data?.rows ?? []).map((r) => ({
      nature: r.nature as Nature,
      behavior: r.behavior as Behavior,
      amount: Number(r.amount),
      account: r.account,
      excluded_from_dre: r.excluded_from_dre ?? false,
    }));
    return buildDre(rows);
  }, [dre.data]);

  const hasData = (dre.data?.rows.length ?? 0) > 0;
  const rl = result.receitaLiquida;
  const share = (value: number) => (rl > 0 ? pct((value / rl) * 100) : "—");

  const accountsByNature = (nature: Nature) =>
    Object.values(result.byAccount)
      .filter((a) => a.nature === nature)
      .sort((a, b) => b.total - a.total);

  const Line = ({
    label,
    value,
    nature,
    strong,
    accent,
  }: {
    label: string;
    value: number;
    nature?: Nature;
    strong?: boolean;
    accent?: boolean;
  }) => (
    <div
      className={`flex items-center justify-between gap-4 border-b border-border px-5 py-3 ${
        strong ? "bg-muted/40 font-semibold" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {nature ? (
          <button
            className="flex items-center gap-1 text-left hover:text-primary"
            onClick={() => setDrill({ nature, account: null, label })}
          >
            {label} <ChevronRight className="h-3 w-3" />
          </button>
        ) : (
          <span className={accent ? "text-primary" : ""}>{label}</span>
        )}
      </div>
      <div className="flex items-center gap-6">
        <span className="w-16 text-right font-mono text-xs text-muted-foreground">
          {share(value)}
        </span>
        <span className={`w-36 text-right font-mono ${accent ? "text-primary" : ""}`}>
          {brl(value)}
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-5">
        <div className="space-y-2">
          <Label htmlFor="from">De</Label>
          <Input
            id="from"
            type="date"
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="to">Até</Label>
          <Input
            id="to"
            type="date"
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
          />
        </div>
        {(dre.data?.dimensions.length ?? 0) > 0 && (
          <div className="space-y-2">
            <Label>Dimensão</Label>
            <Select value={dimension} onValueChange={setDimension}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Consolidado</SelectItem>
                {dre.data?.dimensions.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {(dre.data?.pendingCount ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <p className="text-sm">
            <strong>{dre.data?.pendingCount} lançamento(s) pendentes</strong> no período não entram
            neste demonstrativo. A DRE só considera base validada.
          </p>
        </div>
      )}

      {!hasData ? (
        <div className="rounded-lg border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
          Sem base validada no período selecionado.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <span>Demonstrativo gerencial</span>
            <span>% da receita líquida · valor</span>
          </div>
          <Line label="Receita Bruta" value={result.receitaBruta} nature="receita_bruta" />
          <Line label="(-) Deduções" value={-result.deducoes} nature="deducao" />
          <Line label="= Receita Líquida" value={result.receitaLiquida} strong />
          <Line label="(-) Custos Variáveis" value={-result.custosVariaveis} nature="custo" />
          <Line label="(-) Custos Fixos" value={-result.custosFixos} />
          <Line label="= Margem Bruta" value={result.margemBruta} strong />
          <Line label="(-) Despesas Variáveis" value={-result.despesasVariaveis} nature="despesa" />
          <Line label="= Margem de Contribuição" value={result.margemContribuicao} strong />
          <Line label="(-) Despesas Fixas" value={-result.despesasFixas} />
          <Line label="= EBITDA" value={result.ebitda} strong accent />
          <Line
            label="(+/-) Resultado Financeiro"
            value={result.resultadoFinanceiro}
            nature="despesa_financeira"
          />
          <Line
            label="(+/-) Resultado Não Operacional"
            value={result.resultadoNaoOperacional}
            nature="outra_despesa"
          />
          <Line label="= Resultado Líquido" value={result.resultadoLiquido} strong accent />
        </div>
      )}

      {hasData && (
        <section className="grid gap-6 lg:grid-cols-2">
          {(["custo", "despesa"] as Nature[]).map((nature) => (
            <div key={nature} className="rounded-lg border border-border bg-card">
              <h2 className="border-b border-border px-5 py-3 font-display text-sm font-semibold">
                {NATURE_LABEL[nature]}s por conta
              </h2>
              <div className="divide-y divide-border">
                {accountsByNature(nature)
                  .slice(0, 10)
                  .map((account) => (
                    <button
                      key={account.account}
                      onClick={() =>
                        setDrill({ nature, account: account.account, label: account.account })
                      }
                      className="flex w-full items-center justify-between px-5 py-3 text-left text-sm hover:bg-muted/40"
                    >
                      <span>{account.account}</span>
                      <span className="font-mono">{brl(account.total)}</span>
                    </button>
                  ))}
                {accountsByNature(nature).length === 0 && (
                  <p className="px-5 py-6 text-sm text-muted-foreground">Sem valores no período.</p>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      <Sheet open={Boolean(drill)} onOpenChange={(open) => !open && setDrill(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{drill?.label}</SheetTitle>
            <SheetDescription>
              Lançamentos de origem no período {range.from} a {range.to}.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            {drillQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {drillQuery.data?.map((row) => (
              <div key={row.id} className="rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm">{row.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.entry_date} · {row.counterparty ?? "sem fornecedor"} ·{" "}
                      {row.account ?? "sem conta"}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      origem: {row.classification_source ?? "—"}
                      {row.original_category ? ` · categoria original: ${row.original_category}` : ""}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-mono text-sm">
                    {brl(Number(row.amount))}
                  </span>
                </div>
              </div>
            ))}
            {drillQuery.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum lançamento encontrado.</p>
            )}
          </div>
          <Button className="mt-6" variant="secondary" onClick={() => setDrill(null)}>
            Fechar
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
