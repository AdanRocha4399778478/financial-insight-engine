import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Building2 } from "lucide-react";
import { getMe, listClients, saveClient } from "@/lib/clients.functions";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/clientes/")({
  head: () => ({
    meta: [
      { title: "Clientes — Resultados S/A" },
      { name: "description", content: "Carteira de clientes atendidos pela consultoria Resultados S/A." },
      { property: "og:title", content: "Clientes — Resultados S/A" },
      { property: "og:description", content: "Carteira de clientes da consultoria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientsPage,
});

function ClientsPage() {
  const queryClient = useQueryClient();
  const fetchMe = useServerFn(getMe);
  const fetchClients = useServerFn(listClients);
  const persist = useServerFn(saveClient);

  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const clients = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    trade_name: "",
    industry: "",
    segment: "",
    revenue_model: "",
    dimensions: "",
  });

  const create = useMutation({
    mutationFn: () =>
      persist({
        data: {
          id: null,
          values: {
            name: form.name.trim(),
            trade_name: form.trade_name.trim() || null,
            industry: form.industry.trim() || null,
            segment: form.segment.trim() || null,
            revenue_model: form.revenue_model.trim() || null,
            dimensions: form.dimensions
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
              .slice(0, 20),
            active: true,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Cliente cadastrado.");
      setOpen(false);
      setForm({ name: "", trade_name: "", industry: "", segment: "", revenue_model: "", dimensions: "" });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="min-h-screen bg-background">
      <TopBar email={me.data?.email} isAdmin={me.data?.isAdmin} />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Clientes</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada cliente tem base, regras e histórico próprios.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Novo cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cadastrar cliente</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="name">Razão social</Label>
                  <Input
                    id="name"
                    maxLength={120}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trade">Nome fantasia</Label>
                  <Input
                    id="trade"
                    maxLength={120}
                    value={form.trade_name}
                    onChange={(e) => setForm({ ...form, trade_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Ramo</Label>
                  <Input
                    id="industry"
                    maxLength={80}
                    placeholder="Transporte, Varejo, Serviços..."
                    value={form.industry}
                    onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="segment">Segmento</Label>
                  <Input
                    id="segment"
                    maxLength={80}
                    value={form.segment}
                    onChange={(e) => setForm({ ...form, segment: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="revenue">Modelo de receita</Label>
                  <Input
                    id="revenue"
                    maxLength={120}
                    placeholder="Recorrente, por projeto..."
                    value={form.revenue_model}
                    onChange={(e) => setForm({ ...form, revenue_model: e.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="dims">Dimensões de análise (separadas por vírgula)</Label>
                  <Input
                    id="dims"
                    placeholder="Filial SP, Filial RJ"
                    value={form.dimensions}
                    onChange={(e) => setForm({ ...form, dimensions: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => {
                    if (form.name.trim().length < 2) {
                      toast.error("Informe a razão social.");
                      return;
                    }
                    create.mutate();
                  }}
                  disabled={create.isPending}
                >
                  Salvar cliente
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {clients.isPending && !clients.isError && (
          <p className="mt-10 text-sm text-muted-foreground">Carregando carteira...</p>
        )}

        {clients.isError && (
          <div className="mt-10 rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
            <p className="text-sm font-medium text-foreground">
              Não foi possível carregar a carteira de clientes.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {(clients.error as Error)?.message ?? "Erro desconhecido."}
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => clients.refetch()}
              disabled={clients.isFetching}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        {!clients.isError && clients.data?.length === 0 && (
          <div className="mt-10 rounded-lg border border-dashed border-border p-12 text-center">
            <Building2 className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhum cliente disponível para o seu acesso ainda.
            </p>
          </div>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.data?.map((client) => (
            <Link
              key={client.id}
              to="/clientes/$clientId"
              params={{ clientId: client.id }}
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-lg font-semibold leading-tight">{client.name}</h2>
                {!client.active && <Badge variant="secondary">Inativo</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {client.trade_name || client.industry || "Sem ramo informado"}
              </p>
              <p className="mt-6 font-mono text-xs uppercase tracking-widest text-primary opacity-0 transition-opacity group-hover:opacity-100">
                Abrir painel
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
