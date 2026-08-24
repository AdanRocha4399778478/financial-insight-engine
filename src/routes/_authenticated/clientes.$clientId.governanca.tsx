import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listAudit, listRules, setRuleActive } from "@/lib/entries.functions";
import { deleteImport, listImports } from "@/lib/imports.functions";
import { getMe, listTeam, setClientAccess } from "@/lib/clients.functions";
import { BEHAVIOR_LABEL, NATURE_LABEL, type Behavior, type Nature } from "@/lib/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/clientes/$clientId/governanca")({
  head: () => ({
    meta: [
      { title: "Governança e auditoria — Resultados S/A" },
      {
        name: "description",
        content: "Regras aprendidas, histórico de importações, trilha de auditoria e acesso da equipe ao cliente.",
      },
      { property: "og:title", content: "Governança e auditoria — Resultados S/A" },
      { property: "og:description", content: "Regras, importações, auditoria e acessos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GovernancePage,
});

function GovernancePage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchRules = useServerFn(listRules);
  const toggleRule = useServerFn(setRuleActive);
  const fetchImports = useServerFn(listImports);
  const removeImport = useServerFn(deleteImport);
  const fetchAudit = useServerFn(listAudit);
  const fetchMe = useServerFn(getMe);
  const fetchTeam = useServerFn(listTeam);
  const grantAccess = useServerFn(setClientAccess);

  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const rules = useQuery({
    queryKey: ["rules", clientId],
    queryFn: () => fetchRules({ data: { clientId } }),
  });
  const imports = useQuery({
    queryKey: ["imports", clientId],
    queryFn: () => fetchImports({ data: { clientId } }),
  });
  const audit = useQuery({
    queryKey: ["audit", clientId],
    queryFn: () => fetchAudit({ data: { clientId } }),
  });
  const team = useQuery({
    queryKey: ["team", clientId],
    queryFn: () => fetchTeam({ data: { clientId } }),
    enabled: Boolean(me.data?.isAdmin),
  });

  const ruleMutation = useMutation({
    mutationFn: (input: { ruleId: string; active: boolean }) => toggleRule({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules", clientId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const importMutation = useMutation({
    mutationFn: (importId: string) => removeImport({ data: { importId } }),
    onSuccess: () => {
      toast.success("Importação e lançamentos removidos.");
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const accessMutation = useMutation({
    mutationFn: (input: { userId: string; grant: boolean }) =>
      grantAccess({ data: { clientId, ...input } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team", clientId] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-lg font-semibold">Regras aprendidas</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada confirmação humana pode virar regra e reduzir o esforço da próxima importação.
        </p>
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {rules.data?.map((rule) => (
            <div key={rule.id} className="flex flex-wrap items-center justify-between gap-4 bg-card p-4">
              <div>
                <p className="text-sm">
                  <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    {rule.match_field === "counterparty" ? "fornecedor" : "descrição"}
                  </span>{" "}
                  contém “{rule.pattern}”
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  → {rule.account} · {NATURE_LABEL[rule.nature as Nature]} ·{" "}
                  {BEHAVIOR_LABEL[rule.behavior as Behavior]}
                  {rule.client_id ? "" : " · regra global"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {rule.confirmed && <Badge variant="secondary">Confirmada</Badge>}
                <Switch
                  checked={rule.active}
                  onCheckedChange={(active) => ruleMutation.mutate({ ruleId: rule.id, active })}
                />
              </div>
            </div>
          ))}
          {rules.data?.length === 0 && (
            <p className="bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhuma regra criada ainda.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">Importações</h2>
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {imports.data?.map((imp) => (
            <div key={imp.id} className="flex flex-wrap items-center justify-between gap-3 bg-card p-4">
              <div>
                <p className="text-sm font-medium">{imp.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(imp.created_at).toLocaleString("pt-BR")} · {imp.valid_rows} válidos ·{" "}
                  {imp.duplicate_rows} duplicados · {imp.pending_rows} pendentes
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => importMutation.mutate(imp.id)}
                disabled={importMutation.isPending}
              >
                Desfazer importação
              </Button>
            </div>
          ))}
          {imports.data?.length === 0 && (
            <p className="bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhuma importação registrada.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">Trilha de auditoria</h2>
        <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {audit.data?.slice(0, 50).map((item) => {
            const next = item.next as { account?: string; nature?: string } | null;
            const previous = item.previous as { account?: string | null } | null;
            return (
              <div key={item.id} className="bg-card p-4 text-sm">
                <p>
                  {previous?.account ?? "sem classificação"} → {next?.account ?? "—"}
                  {next?.nature ? ` (${NATURE_LABEL[next.nature as Nature]})` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString("pt-BR")} · origem: {item.source}
                  {item.became_rule ? " · virou regra" : ""}
                </p>
              </div>
            );
          })}
          {audit.data?.length === 0 && (
            <p className="bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhuma alteração registrada ainda.
            </p>
          )}
        </div>
      </section>

      {me.data?.isAdmin && (
        <section>
          <h2 className="font-display text-lg font-semibold">Acesso da equipe</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Consultores só enxergam os clientes liberados aqui.
          </p>
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {team.data?.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-4 bg-card p-4">
                <div>
                  <p className="text-sm">{member.full_name ?? member.email}</p>
                  <p className="text-xs text-muted-foreground">{member.email}</p>
                </div>
                <Switch
                  checked={member.hasAccess}
                  onCheckedChange={(grant) => accessMutation.mutate({ userId: member.id, grant })}
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
