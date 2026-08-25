import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listAudit, listRules, setRuleActive } from "@/lib/entries.functions";
import { deleteImport, listImports } from "@/lib/imports.functions";
import { getMe, listTeam, setClientAccess } from "@/lib/clients.functions";
import { BEHAVIOR_LABEL, NATURE_LABEL, brl, type Behavior, type Nature } from "@/lib/finance";
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

function integrityLabel(status: string | null) {
  if (status === "conciliado") return "CONCILIADO";
  if (status === "divergente") return "DIVERGENTE";
  if (status === "fechamento_inferido") return "FECHAMENTO INFERIDO";
  if (status === "nao_verificado") return "NÃO VERIFICADO";
  return "SEM VERIFICAÇÃO";
}

function integrityVariant(status: string | null): "default" | "destructive" | "secondary" | "outline" {
  if (status === "conciliado") return "default";
  if (status === "divergente") return "destructive";
  if (status === "fechamento_inferido") return "secondary";
  return "outline";
}

function sourceLabel(source: string | null) {
  if (source === "manual") return "manual";
  if (source === "extrato") return "extrato";
  if (source === "inferido") return "inferido";
  return "—";
}

function confidenceLabel(status: string | null) {
  if (status === "conciliado") return "Base validada";
  if (status === "fechamento_inferido") return "Base com ressalva";
  if (status === "divergente") return "Problema crítico";
  if (status === "nao_verificado") return "Precisa revisão";
  return "Sem avaliação";
}

function GovernancePage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();
  const [rulesExpanded, setRulesExpanded] = useState(false);

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

  const totalRules = rules.data?.length ?? 0;
  const activeRules = rules.data?.filter((rule) => rule.active).length ?? 0;
  const confirmedRules = rules.data?.filter((rule) => rule.confirmed).length ?? 0;
  const inactiveRules = totalRules - activeRules;

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Importações e integridade</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Qualidade matemática de cada base importada antes de usá-la como referência financeira.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Conciliado = validada · Inferido = ressalva · Não verificado = revisar · Divergente = crítico
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {imports.data?.map((imp) => (
            <div key={imp.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{imp.filename}</p>
                    <Badge variant={integrityVariant(imp.integrity_status)}>
                      {integrityLabel(imp.integrity_status)}
                    </Badge>
                    <Badge variant="outline">{confidenceLabel(imp.integrity_status)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
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

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">Saldo inicial</p>
                  <p className="mt-1 text-sm font-semibold">
                    {imp.opening_balance === null ? "—" : brl(imp.opening_balance)}
                  </p>
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">Origem: {sourceLabel(imp.opening_balance_source)}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">Saldo calculado</p>
                  <p className="mt-1 text-sm font-semibold">
                    {imp.calculated_balance === null ? "—" : brl(imp.calculated_balance)}
                  </p>
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">Pela movimentação</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">Saldo final</p>
                  <p className="mt-1 text-sm font-semibold">
                    {imp.closing_balance === null ? "—" : brl(imp.closing_balance)}
                  </p>
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">Origem: {sourceLabel(imp.closing_balance_source)}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">Diferença</p>
                  <p className="mt-1 text-sm font-semibold">
                    {imp.balance_difference === null ? "—" : brl(imp.balance_difference)}
                  </p>
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">
                    Tolerância {imp.balance_tolerance === null ? "—" : brl(imp.balance_tolerance)}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">Conferência</p>
                  <p className="mt-1 text-sm font-semibold">{confidenceLabel(imp.integrity_status)}</p>
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">
                    {imp.integrity_checked_at
                      ? new Date(imp.integrity_checked_at).toLocaleString("pt-BR")
                      : "Importação anterior à verificação"}
                  </p>
                </div>
              </div>

              {imp.integrity_status === "divergente" && (
                <p className="mt-3 text-xs text-destructive">
                  Esta importação não deve ser considerada financeiramente validada até a divergência ser revisada.
                </p>
              )}
              {imp.integrity_status === "fechamento_inferido" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  O fechamento matemático foi inferido. Use a base com ressalva até haver duas evidências independentes de saldo.
                </p>
              )}
              {imp.integrity_status === "nao_verificado" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Não houve evidência suficiente para validar matematicamente esta importação.
                </p>
              )}
            </div>
          ))}
          {imports.data?.length === 0 && (
            <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Nenhuma importação registrada.
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold">Regras aprendidas</h2>
              <Badge variant="outline">{totalRules} regras</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada confirmação humana pode virar regra e reduzir o esforço da próxima importação.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setRulesExpanded((value) => !value)}>
            {rulesExpanded ? "Recolher regras" : "Expandir regras"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">Ativas</p>
            <p className="mt-1 text-lg font-semibold">{activeRules}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">Confirmadas</p>
            <p className="mt-1 text-lg font-semibold">{confirmedRules}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">Desativadas</p>
            <p className="mt-1 text-lg font-semibold">{inactiveRules}</p>
          </div>
        </div>

        {rulesExpanded && (
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
        )}
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
