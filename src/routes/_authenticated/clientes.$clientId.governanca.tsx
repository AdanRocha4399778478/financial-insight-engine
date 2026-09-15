import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { listAudit, listRules, setRuleActive } from "@/lib/entries.functions";
import { deleteImport, listImports } from "@/lib/imports.functions";
import { getMe, listClients, listTeam, setClientAccess } from "@/lib/clients.functions";
import { BEHAVIOR_LABEL, NATURE_LABEL, type Behavior, type Nature } from "@/lib/finance";
import {
  buildFromHeaderRow,
  parseSpreadsheet,
  type ParsedFile,
} from "@/lib/parse-file";
import {
  RULE_FIELDS,
  buildRulesFromRows,
  guessRuleMapping,
  type RuleField,
} from "@/lib/rules-file";
import { commitRulesImport, previewRulesImport } from "@/lib/rules-import.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      <RulesImportSection clientId={clientId} isAdmin={Boolean(me.data?.isAdmin)} />

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

const NONE = "__none__";

function RulesImportSection({ clientId, isAdmin }: { clientId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const fetchClients = useServerFn(listClients);
  const preview = useServerFn(previewRulesImport);
  const commit = useServerFn(commitRulesImport);

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<RuleField, string>>>({});
  const [overwrite, setOverwrite] = useState<"pendente" | "sobrescrever" | "ignorar">("pendente");
  const [busy, setBusy] = useState(false);

  const clients = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients() });

  const built = useMemo(() => {
    if (!parsed) return null;
    return buildRulesFromRows(parsed.rows, mapping, clients.data ?? [], {
      canCreateGlobal: isAdmin,
    });
  }, [parsed, mapping, clients.data, isAdmin]);

  const conflictQuery = useQuery({
    queryKey: ["rules-import-preview", built?.rules],
    queryFn: () => preview({ data: { rules: built!.rules } }),
    enabled: Boolean(built?.rules.length),
  });

  const conflicts = conflictQuery.data?.conflicts ?? [];
  const needsDecision = conflicts.length > 0 && overwrite === "pendente";

  const reset = () => {
    setFile(null);
    setParsed(null);
    setMapping({});
    setOverwrite("pendente");
  };

  const handleFile = async (selected: File) => {
    setBusy(true);
    try {
      const result = await parseSpreadsheet(selected);
      if (!result.rows.length) throw new Error("O arquivo não contém linhas de dados.");
      setFile(selected);
      setParsed(result);
      setMapping(guessRuleMapping(result.columns));
      setOverwrite("pendente");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const commitMutation = useMutation({
    mutationFn: () => {
      const rules =
        overwrite === "ignorar"
          ? built!.rules.filter(
              (r) => !conflicts.some((c) => c.source_row === r.source_row),
            )
          : built!.rules;
      if (!rules.length) throw new Error("Nenhuma regra restante para importar.");
      return commit({
        data: { clientId, rules, overwrite: overwrite === "sobrescrever" },
      });
    },
    onSuccess: (result) => {
      toast.success(
        `${result.created} regra(s) criada(s), ${result.updated} atualizada(s), ${result.skipped} ignorada(s).`,
      );
      queryClient.invalidateQueries({ queryKey: ["rules", clientId] });
      queryClient.invalidateQueries({ queryKey: ["audit", clientId] });
      reset();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section>
      <h2 className="font-display text-lg font-semibold">Importar regras em lote</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Suba uma planilha (XLSX, XLS ou CSV) com regras que você já conhece. Deixe a coluna Cliente
        vazia para criar uma regra global.
      </p>

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <UploadCloud className="size-5 text-muted-foreground" />
          <span>{file ? file.name : "Escolher arquivo de regras"}</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) void handleFile(selected);
              event.target.value = "";
            }}
          />
        </label>
        {busy && <p className="mt-2 text-xs text-muted-foreground">Lendo arquivo...</p>}
      </div>

      {parsed && (
        <div className="mt-4 space-y-4 rounded-lg border border-border bg-card p-4">
          {!parsed.confident && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Linha de cabeçalho
              </Label>
              <Select
                value={String(parsed.headerRow)}
                onValueChange={(value) => {
                  const rebuilt = buildFromHeaderRow(parsed.matrix, Number(value));
                  setParsed(rebuilt);
                  setMapping(guessRuleMapping(rebuilt.columns));
                }}
              >
                <SelectTrigger className="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {parsed.matrix.slice(0, 12).map((line, index) => (
                    <SelectItem key={index} value={String(index)}>
                      Linha {index + 1}:{" "}
                      {line
                        .map((c) => (c === null || c === undefined ? "" : String(c)))
                        .filter(Boolean)
                        .slice(0, 5)
                        .join(" | ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RULE_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                <Select
                  value={mapping[field.key] ?? NONE}
                  onValueChange={(value) =>
                    setMapping((prev) => {
                      const next = { ...prev };
                      if (value === NONE) delete next[field.key];
                      else next[field.key] = value;
                      return next;
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Não usar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não usar</SelectItem>
                    {parsed.columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {built && (
            <div className="space-y-3 rounded-md border border-border p-3 text-sm">
              <p>
                {built.read} linha(s) lida(s) · <strong>{built.rules.length}</strong> regra(s)
                válida(s) · {built.errors.length} descartada(s)
                {built.duplicatesMerged > 0
                  ? ` · ${built.duplicatesMerged} duplicata(s) idêntica(s) consolidada(s)`
                  : ""}
              </p>

              {built.rules.length > 0 && (
                <div className="divide-y divide-border rounded-md border border-border">
                  {built.rules.slice(0, 8).map((rule) => (
                    <div key={rule.source_row} className="p-2 text-xs">
                      <span className="font-mono uppercase tracking-wider text-muted-foreground">
                        {rule.match_field === "counterparty" ? "fornecedor" : "descrição"}
                      </span>{" "}
                      contém “{rule.pattern}” → {rule.account} · {NATURE_LABEL[rule.nature]} ·{" "}
                      {BEHAVIOR_LABEL[rule.behavior]}
                      {rule.client_name ? ` · ${rule.client_name}` : " · regra global"}
                    </div>
                  ))}
                  {built.rules.length > 8 && (
                    <p className="p-2 text-xs text-muted-foreground">
                      + {built.rules.length - 8} regra(s) não exibida(s).
                    </p>
                  )}
                </div>
              )}

              {built.errors.length > 0 && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
                  <p className="font-medium">Linhas descartadas</p>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {built.errors.slice(0, 10).map((error, index) => (
                      <li key={`${error.row}-${index}`}>
                        Linha {error.row}: {error.reason}
                      </li>
                    ))}
                    {built.errors.length > 10 && (
                      <li>+ {built.errors.length - 10} outra(s).</li>
                    )}
                  </ul>
                </div>
              )}

              {conflicts.length > 0 && (
                <div className="rounded-md border border-border p-3 text-xs">
                  <p className="font-medium">
                    {conflicts.length} regra(s) já existem com o mesmo padrão
                  </p>
                  <ul className="mt-1 space-y-1 text-muted-foreground">
                    {conflicts.slice(0, 8).map((conflict) => (
                      <li key={conflict.source_row}>
                        “{conflict.pattern}”: {conflict.current.account} →{" "}
                        {conflict.next.account}
                        {conflict.client_name ? ` · ${conflict.client_name}` : " · global"}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={overwrite === "sobrescrever" ? "default" : "outline"}
                      onClick={() => setOverwrite("sobrescrever")}
                    >
                      Sobrescrever regras existentes
                    </Button>
                    <Button
                      size="sm"
                      variant={overwrite === "ignorar" ? "default" : "outline"}
                      onClick={() => setOverwrite("ignorar")}
                    >
                      Ignorar as conflitantes
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => commitMutation.mutate()}
                  disabled={
                    !built.rules.length ||
                    needsDecision ||
                    conflictQuery.isFetching ||
                    commitMutation.isPending
                  }
                >
                  {commitMutation.isPending ? "Importando..." : "Importar regras"}
                </Button>
                <Button variant="ghost" onClick={reset}>
                  Cancelar
                </Button>
              </div>
              {needsDecision && (
                <p className="text-xs text-muted-foreground">
                  Escolha o que fazer com as regras já existentes antes de importar.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
