import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listAccountMappings, saveAccountMapping } from "@/lib/dre-import.functions";
import {
  AREAS,
  BEHAVIORS,
  BEHAVIOR_LABEL,
  NATURES,
  NATURE_LABEL,
  type Behavior,
  type Nature,
} from "@/lib/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clientes/$clientId/contas")({
  head: () => ({
    meta: [
      { title: "Contas a mapear — Resultados S/A" },
      {
        name: "description",
        content:
          "Associação entre o plano de contas do cliente e o Plano Gerencial Resultados, reutilizada nas próximas importações.",
      },
      { property: "og:title", content: "Contas a mapear — Resultados S/A" },
      {
        property: "og:description",
        content: "Mapeamento persistente de contas da DRE pronta ao Plano Gerencial Resultados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

const NONE = "__none__";

function AccountsPage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchMappings = useServerFn(listAccountMappings);
  const save = useServerFn(saveAccountMapping);

  const mappings = useQuery({
    queryKey: ["account-mappings", clientId],
    queryFn: () => fetchMappings({ data: { clientId } }),
  });

  const update = useMutation({
    mutationFn: (input: {
      accountCode: string;
      nature: string;
      behavior: string;
      area: string | null;
    }) => save({ data: { clientId, ...input } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["account-mappings", clientId] });
      toast.success("Conta mapeada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = mappings.data ?? [];
  const pending = rows.filter((r) => r.nature === "nao_definido");

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Contas a mapear</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Contas vindas de DREs prontas. O mapeamento fica salvo por cliente e é reaproveitado
              nas próximas importações. Contas sem correspondência não entram na DRE.
            </p>
          </div>
          <Badge variant={pending.length ? "destructive" : "default"}>
            {pending.length} pendentes · {rows.length} contas
          </Badge>
        </div>

        {mappings.isLoading && (
          <p className="mt-6 text-sm text-muted-foreground">Carregando contas...</p>
        )}

        {mappings.isError && (
          <div className="mt-6 rounded-lg border border-destructive/50 p-6">
            <p className="text-sm text-destructive">
              Não foi possível carregar as contas: {(mappings.error as Error).message}
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void mappings.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}

        {!mappings.isLoading && !mappings.isError && rows.length === 0 && (
          <p className="mt-6 text-sm text-muted-foreground">
            Nenhuma conta importada por DRE pronta até o momento.
          </p>
        )}

        {rows.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Conta</th>
                  <th className="px-4 py-3">Nome original</th>
                  <th className="px-4 py-3">Natureza gerencial</th>
                  <th className="px-4 py-3">Comportamento</th>
                  <th className="px-4 py-3">Área</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      {row.account_code}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3">{row.account_name}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={row.nature}
                        onValueChange={(value) =>
                          update.mutate({
                            accountCode: row.account_code,
                            nature: value,
                            behavior: row.behavior,
                            area: row.area,
                          })
                        }
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NATURES.map((nature: Nature) => (
                            <SelectItem key={nature} value={nature}>
                              {NATURE_LABEL[nature]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={row.behavior}
                        onValueChange={(value) =>
                          update.mutate({
                            accountCode: row.account_code,
                            nature: row.nature,
                            behavior: value,
                            area: row.area,
                          })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BEHAVIORS.map((behavior: Behavior) => (
                            <SelectItem key={behavior} value={behavior}>
                              {BEHAVIOR_LABEL[behavior]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={row.area ?? NONE}
                        onValueChange={(value) =>
                          update.mutate({
                            accountCode: row.account_code,
                            nature: row.nature,
                            behavior: row.behavior,
                            area: value === NONE ? null : value,
                          })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue placeholder="Sem área" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Sem área</SelectItem>
                          {AREAS.map((area) => (
                            <SelectItem key={area} value={area}>
                              {area}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
