import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClientMetrics } from "@/lib/dre.functions";
import { listImports } from "@/lib/imports.functions";
import { pct } from "@/lib/finance";
import { ImportIntegrityStatus, type IntegrityStatus } from "@/components/import-integrity-status";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/clientes/$clientId/")({
  head: () => ({
    meta: [
      { title: "Visão geral do cliente — Resultados S/A" },
      {
        name: "description",
        content: "Situação da base do cliente: importações, taxa de classificação automática e pendências.",
      },
      { property: "og:title", content: "Visão geral do cliente — Resultados S/A" },
      { property: "og:description", content: "Situação da base, automação e pendências do cliente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-3 font-display text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function importStatusLabel(status: string | null) {
  if (status === "conciliado") return "Conciliada";
  if (status === "divergente") return "Divergente";
  if (status === "fechamento_inferido") return "Ressalva";
  if (status === "nao_verificado") return "Revisar";
  return "Sem avaliação";
}

function Overview() {
  const { clientId } = Route.useParams();
  const fetchMetrics = useServerFn(getClientMetrics);
  const fetchImports = useServerFn(listImports);

  const metrics = useQuery({
    queryKey: ["metrics", clientId],
    queryFn: () => fetchMetrics({ data: { clientId } }),
  });
  const imports = useQuery({
    queryKey: ["imports", clientId],
    queryFn: () => fetchImports({ data: { clientId } }),
  });

  const m = metrics.data;
  const latestImport = imports.data?.[0];

  return (
    <div className="space-y-10">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Lançamentos" value={String(m?.total ?? 0)} hint="Base acumulada do cliente" />
        <Stat
          label="Automação"
          value={m ? pct(m.autoRate) : "—"}
          hint="Classificados sem intervenção humana"
        />
        <Stat
          label="Pendências"
          value={String(m?.pending ?? 0)}
          hint="Fora da DRE até serem tratadas"
        />
        <Stat label="Regras ativas" value={String(m?.rules ?? 0)} hint="Aprendizado do cliente" />
      </div>

      {latestImport && (
        <ImportIntegrityStatus
          clientId={clientId}
          status={latestImport.integrity_status as IntegrityStatus}
          filename={latestImport.filename}
          checkedAt={latestImport.integrity_checked_at}
          difference={latestImport.balance_difference}
        />
      )}

      {(m?.pending ?? 0) > 0 && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-6">
          <p className="font-display text-sm font-semibold">
            {m?.pending} lançamento(s) aguardando classificação.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            A DRE só considera lançamentos classificados. Trate as pendências antes de apresentar o resultado.
          </p>
          <Link
            to="/clientes/$clientId/classificacao"
            params={{ clientId }}
            className="mt-4 inline-block font-mono text-xs uppercase tracking-widest text-primary"
          >
            Resolver pendências →
          </Link>
        </div>
      )}

      <section>
        <h2 className="font-display text-lg font-semibold">Importações recentes</h2>
        {imports.data?.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhum arquivo importado ainda para este cliente.
          </p>
        )}
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {imports.data?.slice(0, 8).map((imp) => (
            <div key={imp.id} className="flex flex-wrap items-center justify-between gap-3 bg-card p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{imp.filename}</p>
                  <Badge variant="outline">{importStatusLabel(imp.integrity_status)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(imp.created_at).toLocaleString("pt-BR")}
                  {imp.period_label ? ` · ${imp.period_label}` : ""}
                </p>
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                {imp.valid_rows} válidos · {imp.duplicate_rows} duplicados · {imp.pending_rows}{" "}
                pendentes
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
