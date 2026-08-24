import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClient, getMe } from "@/lib/clients.functions";
import { TopBar } from "@/components/top-bar";

export const Route = createFileRoute("/_authenticated/clientes/$clientId")({
  component: ClientLayout,
});

const tabs: { to: string; label: string; exact?: boolean }[] = [
  { to: "/clientes/$clientId", label: "Visão geral", exact: true },
  { to: "/clientes/$clientId/importar", label: "Importar" },
  { to: "/clientes/$clientId/classificacao", label: "Classificação" },
  { to: "/clientes/$clientId/contas", label: "Contas" },
  { to: "/clientes/$clientId/dre", label: "DRE" },
  { to: "/clientes/$clientId/indicadores", label: "Indicadores" },
  { to: "/clientes/$clientId/governanca", label: "Governança" },
];

function ClientLayout() {
  const { clientId } = Route.useParams();
  const fetchClient = useServerFn(getClient);
  const fetchMe = useServerFn(getMe);

  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const client = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => fetchClient({ data: { clientId } }),
  });

  return (
    <div className="min-h-screen bg-background">
      <TopBar email={me.data?.email} isAdmin={me.data?.isAdmin} />
      <div className="border-b border-border">
        <div className="mx-auto max-w-7xl px-6 pt-8">
          <Link
            to="/clientes"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            ← Clientes
          </Link>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            {client.data?.name ?? "Carregando..."}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {[client.data?.industry, client.data?.segment, client.data?.revenue_model]
              .filter(Boolean)
              .join(" · ") || "Sem contexto de negócio informado"}
          </p>
          <nav className="mt-6 flex gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <Link
                key={tab.to}
                to={tab.to as never}
                params={{ clientId } as never}
                activeOptions={{ exact: tab.exact ?? false }}
                className="whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
