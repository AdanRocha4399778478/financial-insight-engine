import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import {
  classifyEntries,
  confirmSuggestions,
  ignoreEntries,
  listEntries,
  suggestWithAI,
} from "@/lib/entries.functions";
import { confirmCurrentClassifications } from "@/lib/confirm-current-classifications.functions";
import {
  AREAS,
  BEHAVIORS,
  BEHAVIOR_LABEL,
  NATURES,
  NATURE_LABEL,
  STATUS_LABEL,
  brl,
  type Behavior,
  type EntryStatus,
  type Nature,
} from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clientes/$clientId/classificacao")({
  head: () => ({
    meta: [
      { title: "Classificação de lançamentos — Resultados S/A" },
      {
        name: "description",
        content: "Fila de pendências e sugestões com confirmação em lote, criação de regras e apoio de IA.",
      },
      { property: "og:title", content: "Classificação de lançamentos — Resultados S/A" },
      { property: "og:description", content: "Pendências, sugestões e confirmação em lote." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClassificationPage,
});

const NONE = "__none__";
const statusFilters: { key: string; label: string }[] = [
  { key: "pendente", label: "Pendentes" },
  { key: "sugerido", label: "Sugeridos" },
  { key: "auto", label: "Automáticos" },
  { key: "confirmado", label: "Confirmados" },
  { key: "ignorado", label: "Ignorados" },
  { key: "todos", label: "Todos" },
];

const statusTone: Record<EntryStatus, string> = {
  pendente: "bg-destructive/15 text-destructive",
  sugerido: "bg-primary/15 text-primary",
  auto: "bg-muted text-muted-foreground",
  confirmado: "bg-success/15 text-success",
  ignorado: "bg-muted text-muted-foreground line-through",
};

function ClassificationPage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchEntries = useServerFn(listEntries);
  const applyClassification = useServerFn(classifyEntries);
  const confirm = useServerFn(confirmSuggestions);
  const ignore = useServerFn(ignoreEntries);
  const askAI = useServerFn(suggestWithAI);

  const [status, setStatus] = useState("pendente");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [form, setForm] = useState<{
    account: string;
    nature: Nature;
    behavior: Behavior;
    area: string;
  }>({ account: "", nature: "despesa", behavior: "fixo", area: NONE });
  const [createRule, setCreateRule] = useState(true);
  const [ruleField, setRuleField] = useState<"description" | "counterparty">("description");
  const [rulePattern, setRulePattern] = useState("");

  const entries = useQuery({
    queryKey: ["entries", clientId, status, search],
    queryFn: () =>
      fetchEntries({
        data: { clientId, status, search: search.trim() || null, importId: null, limit: 200 },
      }),
  });

  const rows = entries.data?.rows ?? [];
  const summary = entries.data?.summary;
  const allSelected = rows.length > 0 && selected.length === rows.length;

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.includes(r.id)),
    [rows, selected],
  );

  const refresh = () => {
    setSelected([]);
    queryClient.invalidateQueries();
  };

  const classify = useMutation({
    mutationFn: () =>
      applyClassification({
        data: {
          clientId,
          entryIds: selected,
          values: {
            account: form.account.trim(),
            nature: form.nature,
            behavior: form.behavior,
            area: form.area === NONE ? null : form.area,
          },
          createRule,
          ruleField,
          rulePattern: rulePattern.trim() || null,
        },
      }),
    onSuccess: (result) => {
      toast.success(
        `${result.updated} lançamento(s) confirmados${result.ruleId ? " · regra criada" : ""}`,
      );
      setForm({ ...form, account: "" });
      setRulePattern("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkConfirm = useMutation({
    mutationFn: () => confirm({ data: { clientId, entryIds: selected } }),
    onSuccess: (r) => {
      toast.success(`${r.updated} sugestão(ões) confirmada(s).`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkIgnore = useMutation({
    mutationFn: () => ignore({ data: { clientId, entryIds: selected } }),
    onSuccess: (r) => {
      toast.success(`${r.updated} lançamento(s) fora da DRE.`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ai = useMutation({
    mutationFn: () => askAI({ data: { clientId, entryIds: selected.slice(0, 60) } }),
    onSuccess: (r) => {
      toast.success(`${r.updated} sugestão(ões) geradas pela IA. Revise antes de confirmar.`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {statusFilters.map((filter) => (
          <button
            key={filter.key}
            onClick={() => {
              setStatus(filter.key);
              setSelected([]);
            }}
            className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
              status === filter.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {filter.label}
            {summary && filter.key !== "todos"
              ? ` · ${summary[filter.key as keyof typeof summary] ?? 0}`
              : ""}
          </button>
        ))}
        <Input
          value={search}
          maxLength={120}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar descrição ou fornecedor"
          className="ml-auto w-full sm:w-72"
        />
      </div>

      {selected.length > 0 && (
        <section className="rounded-lg border border-primary/40 bg-card p-6">
          <p className="font-display text-sm font-semibold">
            {selected.length} lançamento(s) selecionado(s)
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="account">Conta gerencial</Label>
              <Input
                id="account"
                maxLength={120}
                placeholder="Combustível, Salários..."
                value={form.account}
                onChange={(e) => setForm({ ...form, account: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Natureza</Label>
              <Select
                value={form.nature}
                onValueChange={(value) => setForm({ ...form, nature: value as Nature })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NATURES.map((n) => (
                    <SelectItem key={n} value={n}>
                      {NATURE_LABEL[n]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Comportamento</Label>
              <Select
                value={form.behavior}
                onValueChange={(value) => setForm({ ...form, behavior: value as Behavior })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BEHAVIORS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {BEHAVIOR_LABEL[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Área</Label>
              <Select value={form.area} onValueChange={(value) => setForm({ ...form, area: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem área</SelectItem>
                  {AREAS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-border p-4">
            <div className="flex items-center gap-3">
              <Switch id="rule" checked={createRule} onCheckedChange={setCreateRule} />
              <Label htmlFor="rule">Aprender como regra do cliente</Label>
            </div>
            {createRule && (
              <>
                <Select
                  value={ruleField}
                  onValueChange={(v) => setRuleField(v as "description" | "counterparty")}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="description">Padrão na descrição</SelectItem>
                    <SelectItem value="counterparty">Fornecedor</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="w-64"
                  maxLength={200}
                  placeholder="Texto do padrão (opcional)"
                  value={rulePattern}
                  onChange={(e) => setRulePattern(e.target.value)}
                />
              </>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              onClick={() => {
                if (!form.account.trim()) {
                  toast.error("Informe a conta gerencial.");
                  return;
                }
                classify.mutate();
              }}
              disabled={classify.isPending}
            >
              Confirmar classificação
            </Button>
            <Button variant="secondary" onClick={() => bulkConfirm.mutate()} disabled={bulkConfirm.isPending}>
              Aceitar sugestões atuais
            </Button>
            <Button variant="secondary" onClick={() => ai.mutate()} disabled={ai.isPending}>
              <Sparkles className="mr-2 h-4 w-4" />
              {ai.isPending ? "Consultando IA..." : "Sugerir com IA"}
            </Button>
            <Button variant="ghost" onClick={() => bulkIgnore.mutate()} disabled={bulkIgnore.isPending}>
              Ignorar da DRE
            </Button>
            <Button variant="ghost" onClick={() => setSelected([])}>
              Limpar seleção
            </Button>
          </div>

          {selectedRows.length > 0 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Exemplo: {selectedRows[0]!.description}
            </p>
          )}
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 font-mono text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-10 px-4 py-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) => setSelected(checked ? rows.map((r) => r.id) : [])}
                />
              </th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Classificação</th>
              <th className="px-4 py-3">Origem</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="bg-card">
                <td className="px-4 py-3">
                  <Checkbox
                    checked={selected.includes(row.id)}
                    onCheckedChange={(checked) =>
                      setSelected((prev) =>
                        checked ? [...prev, row.id] : prev.filter((id) => id !== row.id),
                      )
                    }
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{row.entry_date}</td>
                <td className="max-w-sm px-4 py-3">
                  <p className="truncate">{row.description}</p>
                  {row.counterparty && (
                    <p className="truncate text-xs text-muted-foreground">{row.counterparty}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.account ? (
                    <>
                      <p>{row.account}</p>
                      <p className="text-xs text-muted-foreground">
                        {NATURE_LABEL[row.nature as Nature]} ·{" "}
                        {BEHAVIOR_LABEL[row.behavior as Behavior]}
                      </p>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {row.classification_source ?? "—"}
                  <span className="ml-1 font-mono">
                    {row.confidence ? `(${Math.round(row.confidence * 100)}%)` : ""}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                  {brl(Number(row.amount))}
                </td>
                <td className="px-4 py-3">
                  <Badge className={statusTone[row.status as EntryStatus]} variant="secondary">
                    {STATUS_LABEL[row.status as EntryStatus]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries.isLoading && rows.length === 0 && (
          <p className="bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhum lançamento neste filtro.
          </p>
        )}
        {entries.isLoading && (
          <p className="bg-card p-10 text-center text-sm text-muted-foreground">Carregando...</p>
        )}
      </div>
    </div>
  );
}
