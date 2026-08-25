import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, RefreshCcw, Sparkles } from "lucide-react";
import {
  classifyEntries,
  confirmSuggestions,
  ignoreEntries,
  listEntries,
  suggestWithAI,
} from "@/lib/entries.functions";
import { classifyBalanceEntries } from "@/lib/balance-classification.functions";
import { confirmCurrentClassifications } from "@/lib/confirm-current-classifications.functions";
import { reclassifyPendingFromLearning } from "@/lib/reclassify-training.functions";
import { listPendingIdentitySummary } from "@/lib/pending-identities.functions";
import { diagnoseTrainingMatchGaps } from "@/lib/training-match-diagnostics.functions";
import {
  BALANCE_GROUPS,
  BALANCE_GROUP_LABEL,
  STATEMENT_TYPES,
  STATEMENT_TYPE_LABEL,
  type BalanceGroup,
  type StatementType,
} from "@/lib/accounting";
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
const primaryFilters = [
  { key: "pendente", label: "Pendentes" },
  { key: "sugerido", label: "Sugeridos" },
  { key: "auto", label: "Automáticos" },
] as const;
const secondaryFilters = [
  { key: "confirmado", label: "Confirmados" },
  { key: "ignorado", label: "Ignorados" },
  { key: "todos", label: "Todos" },
] as const;

const statusTone: Record<EntryStatus, string> = {
  pendente: "bg-destructive/15 text-destructive",
  sugerido: "bg-primary/15 text-primary",
  auto: "bg-muted text-muted-foreground",
  confirmado: "bg-success/15 text-success",
  ignorado: "bg-muted text-muted-foreground line-through",
};

const relationLabel = {
  direction_mismatch: "direção diferente",
  partial_identity: "identidade parcial",
  no_candidate: "sem candidato",
} as const;

function ClassificationPage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();
  const entriesSectionRef = useRef<HTMLDivElement | null>(null);

  const fetchEntries = useServerFn(listEntries);
  const fetchPendingIdentitySummary = useServerFn(listPendingIdentitySummary);
  const fetchMatchDiagnostics = useServerFn(diagnoseTrainingMatchGaps);
  const applyClassification = useServerFn(classifyEntries);
  const applyBalanceClassification = useServerFn(classifyBalanceEntries);
  const confirmCurrent = useServerFn(confirmCurrentClassifications);
  const confirm = useServerFn(confirmSuggestions);
  const ignore = useServerFn(ignoreEntries);
  const askAI = useServerFn(suggestWithAI);
  const reprocessLearning = useServerFn(reclassifyPendingFromLearning);

  const [status, setStatus] = useState("pendente");
  const [search, setSearch] = useState("");
  const [paretoEntryIds, setParetoEntryIds] = useState<string[] | null>(null);
  const [paretoLabel, setParetoLabel] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [reclassifyMode, setReclassifyMode] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const [statementType, setStatementType] = useState<StatementType>("resultado");
  const [balanceGroup, setBalanceGroup] = useState<BalanceGroup>("passivo");
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
    queryKey: ["entries", clientId, status, search, paretoEntryIds],
    queryFn: () =>
      fetchEntries({
        data: {
          clientId,
          status,
          search: paretoEntryIds ? null : search.trim() || null,
          entryIds: paretoEntryIds,
          importId: null,
          limit: 200,
        },
      }),
  });

  const pendingIdentitySummary = useQuery({
    queryKey: ["pending-identity-summary", clientId],
    queryFn: () => fetchPendingIdentitySummary({ data: { clientId, limit: 10 } }),
  });

  const matchDiagnostics = useQuery({
    queryKey: ["training-match-diagnostics", clientId],
    queryFn: () => fetchMatchDiagnostics({ data: { clientId, limit: 10 } }),
  });

  const rows = entries.data?.rows ?? [];
  const summary = entries.data?.summary;
  const visibleRows = showAllRows || paretoEntryIds || search.trim() ? rows : rows.slice(0, 10);
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selected.includes(row.id));

  const selectedRows = useMemo(
    () => rows.filter((row) => selected.includes(row.id)),
    [rows, selected],
  );

  const selectionStats = useMemo(() => {
    let resultado = 0;
    let balanco = 0;
    let totalAmount = 0;
    const groups = new Map<string, number>();

    for (const row of selectedRows) {
      if (row.statement_type === "balanco") balanco += 1;
      else resultado += 1;
      totalAmount += Math.abs(Number(row.amount) || 0);

      const secondary =
        row.statement_type === "balanco"
          ? `Balanço · ${BALANCE_GROUP_LABEL[row.balance_group as BalanceGroup] ?? "Sem grupo"}`
          : `${NATURE_LABEL[row.nature as Nature]} · ${BEHAVIOR_LABEL[row.behavior as Behavior]}`;
      const key = row.account ? `${row.account} · ${secondary}` : "Sem classificação";
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }

    return {
      resultado,
      balanco,
      totalAmount,
      top: [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4),
      heterogeneous: groups.size > 1,
    };
  }, [selectedRows]);

  const suggestionGroups = useMemo(() => {
    if (status !== "sugerido") return [];
    const groups = new Map<string, { account: string; nature: string; behavior: string; count: number }>();
    for (const row of rows) {
      if (!row.account) continue;
      const key = `${row.account}|${row.nature}|${row.behavior}`;
      const current = groups.get(key);
      if (current) current.count += 1;
      else groups.set(key, { account: row.account, nature: row.nature, behavior: row.behavior, count: 1 });
    }
    return [...groups.values()].sort((a, b) => b.count - a.count);
  }, [rows, status]);

  const isAutomaticFilter = status === "auto";
  const showClassificationForm = status !== "sugerido" && (!isAutomaticFilter || reclassifyMode);

  const clearParetoFilter = () => {
    setParetoEntryIds(null);
    setParetoLabel(null);
  };

  const changeStatus = (next: string) => {
    setStatus(next);
    setSelected([]);
    setReclassifyMode(false);
    setShowAllRows(false);
    clearParetoFilter();
  };

  const refresh = () => {
    setSelected([]);
    setReclassifyMode(false);
    queryClient.invalidateQueries();
  };

  const focusParetoIdentity = (item: { historyKey: string; entryIds: string[] }) => {
    setSearch("");
    setParetoEntryIds(item.entryIds);
    setParetoLabel(item.historyKey);
    setStatus("pendente");
    setSelected([]);
    setShowAllRows(true);
    window.setTimeout(() => entriesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
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
      toast.success(`${result.updated} lançamento(s) confirmados${result.ruleId ? " · regra criada" : ""}`);
      setForm({ ...form, account: "" });
      setRulePattern("");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const classifyBalance = useMutation({
    mutationFn: () =>
      applyBalanceClassification({
        data: { clientId, entryIds: selected, account: form.account.trim(), balanceGroup },
      }),
    onSuccess: (result) => {
      toast.success(`${result.updated} lançamento(s) confirmados no Balanço Patrimonial.`);
      setForm({ ...form, account: "" });
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const confirmAutomatic = useMutation({
    mutationFn: () => confirmCurrent({ data: { clientId, entryIds: selected } }),
    onSuccess: (result) => {
      const { learned, duplicates, conflicts } = result.learning;
      const learningSummary =
        learned + duplicates + conflicts > 0
          ? ` · aprendizado: ${learned} novo(s), ${duplicates} já existente(s), ${conflicts} conflito(s)`
          : "";
      toast.success(`${result.updated} classificação(ões) atual(is) confirmada(s)${learningSummary}.`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkConfirm = useMutation({
    mutationFn: () => confirm({ data: { clientId, entryIds: selected } }),
    onSuccess: (result) => {
      if (result.updated > 0) toast.success(`${result.updated} sugestão(ões) confirmada(s).`);
      else toast.info("Nenhuma sugestão elegível para confirmar.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const confirmVisibleSuggestions = useMutation({
    mutationFn: () => confirm({ data: { clientId, entryIds: rows.map((row) => row.id) } }),
    onSuccess: (result) => {
      if (result.updated > 0) toast.success(`${result.updated} sugestão(ões) confirmada(s).`);
      else toast.info("Nenhuma sugestão elegível para confirmar.");
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkIgnore = useMutation({
    mutationFn: () => ignore({ data: { clientId, entryIds: selected } }),
    onSuccess: (result) => {
      toast.success(`${result.updated} lançamento(s) fora da DRE.`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ai = useMutation({
    mutationFn: () => askAI({ data: { clientId, entryIds: selected.slice(0, 60) } }),
    onSuccess: (result) => {
      toast.success(`${result.updated} sugestão(ões) geradas pela IA. Revise antes de confirmar.`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reprocess = useMutation({
    mutationFn: () => reprocessLearning({ data: { clientId } }),
    onSuccess: (result) => {
      toast.success(`${result.automatic} automático(s), ${result.suggested} sugerido(s), ${result.remaining} ainda pendente(s).`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6 pb-24">
      <div className="sticky top-0 z-30 -mx-1 border-b border-border bg-background/95 px-1 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          {primaryFilters.map((filter) => (
            <button
              key={filter.key}
              onClick={() => changeStatus(filter.key)}
              className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
                status === filter.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {filter.label}{summary ? ` · ${summary[filter.key as keyof typeof summary] ?? 0}` : ""}
            </button>
          ))}
          <Select value={secondaryFilters.some((item) => item.key === status) ? status : NONE} onValueChange={changeStatus}>
            <SelectTrigger className="h-8 w-36 rounded-full text-xs">
              <SelectValue placeholder="Mais filtros" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} disabled>Mais filtros</SelectItem>
              {secondaryFilters.map((filter) => (
                <SelectItem key={filter.key} value={filter.key}>
                  {filter.label}{summary && filter.key !== "todos" ? ` · ${summary[filter.key as keyof typeof summary] ?? 0}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            maxLength={120}
            onChange={(event) => {
              clearParetoFilter();
              setSearch(event.target.value);
            }}
            placeholder="Buscar descrição ou fornecedor"
            className="ml-auto w-full sm:w-72"
          />
        </div>
      </div>

      {status === "pendente" && pendingIdentitySummary.data && pendingIdentitySummary.data.totalPending > 0 && (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-base font-semibold">Prioridades para resolver agora</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pendingIdentitySummary.data.totalPending} pendência(s) em {pendingIdentitySummary.data.totalIdentities} identidade(s). Comece pelas 5 que mais se repetem.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => reprocess.mutate()}
              disabled={reprocess.isPending || (summary?.pendente ?? 0) === 0}
            >
              <RefreshCcw className={`mr-2 h-4 w-4 ${reprocess.isPending ? "animate-spin" : ""}`} />
              {reprocess.isPending ? "Reprocessando..." : "Reprocessar aprendizado"}
            </Button>
          </div>

          <div className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
            {pendingIdentitySummary.data.items.slice(0, 5).map((item, index) => (
              <button
                key={item.historyKey}
                type="button"
                onClick={() => focusParetoIdentity(item)}
                className="flex w-full flex-wrap items-center gap-4 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs text-primary">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">{item.historyKey}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{item.sampleDescription}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{item.count} lançamento(s)</p>
                  <p className="font-mono text-xs text-muted-foreground">{brl(item.totalAmount)}</p>
                </div>
                <span className="text-xs font-medium text-primary">Resolver grupo →</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Resolver um grupo filtra somente os lançamentos daquela identidade. Depois mostramos a próxima prioridade.
          </p>
        </section>
      )}

      {status === "pendente" && matchDiagnostics.data && matchDiagnostics.data.totalPending > 0 && (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-sm font-semibold">Diagnóstico do aprendizado</p>
                <Badge variant="outline">{matchDiagnostics.data.uncoveredIdentities} sem cobertura</Badge>
                <Badge variant="outline">{matchDiagnostics.data.exactMatches} matches exatos</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Informação técnica para investigar por que algumas identidades ainda não foram aprendidas.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowDiagnostics((value) => !value)}>
              {showDiagnostics ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
              {showDiagnostics ? "Recolher diagnóstico" : "Ver diagnóstico"}
            </Button>
          </div>

          {showDiagnostics && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Pendente</th>
                    <th className="px-4 py-3">Relação</th>
                    <th className="px-4 py-3">Candidato histórico</th>
                    <th className="px-4 py-3">Conta</th>
                    <th className="px-4 py-3 text-right">Ocorrências</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matchDiagnostics.data.items.map((item) => (
                    <tr key={item.pendingKey}>
                      <td className="max-w-xs px-4 py-3 font-mono text-xs">
                        <p className="truncate">{item.pendingKey}</p>
                        <p className="mt-1 truncate text-muted-foreground">{item.sampleDescription}</p>
                      </td>
                      <td className="px-4 py-3"><Badge variant="secondary">{relationLabel[item.relation]}</Badge></td>
                      <td className="max-w-xs px-4 py-3 font-mono text-xs text-muted-foreground">{item.candidateKey ?? "—"}</td>
                      <td className="px-4 py-3">{item.candidateAccount ?? "—"}</td>
                      <td className="px-4 py-3 text-right">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {status === "sugerido" && rows.length > 0 && (
        <section className="rounded-lg border border-primary/30 bg-primary/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-display text-sm font-semibold">Sugestões prontas para revisão</p>
              <p className="mt-1 text-xs text-muted-foreground">{rows.length} sugestão(ões). Confira os grupos principais antes de confirmar.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestionGroups.slice(0, 4).map((group) => (
                  <Badge key={`${group.account}-${group.nature}-${group.behavior}`} variant="secondary">
                    {group.count}× {group.account}
                  </Badge>
                ))}
              </div>
            </div>
            <Button onClick={() => confirmVisibleSuggestions.mutate()} disabled={confirmVisibleSuggestions.isPending}>
              {confirmVisibleSuggestions.isPending ? "Confirmando..." : `Confirmar ${rows.length}`}
            </Button>
          </div>
        </section>
      )}

      <div ref={entriesSectionRef} className="scroll-mt-24 space-y-4">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="font-display text-sm font-semibold">Lançamentos</p>
              <p className="text-xs text-muted-foreground">
                Mostrando {visibleRows.length} de {rows.length} item(ns)
                {paretoLabel ? ` · grupo: ${paretoLabel}` : search.trim() ? ` · filtro: ${search.trim()}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(search.trim() || paretoEntryIds) && (
                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); clearParetoFilter(); setShowAllRows(false); }}>
                  Limpar filtro
                </Button>
              )}
              {!paretoEntryIds && !search.trim() && rows.length > 10 && (
                <Button variant="outline" size="sm" onClick={() => setShowAllRows((value) => !value)}>
                  {showAllRows ? "Mostrar menos" : `Ver todos (${rows.length})`}
                </Button>
              )}
            </div>
          </div>

          <div className={showAllRows ? "max-h-[68vh] overflow-auto" : "overflow-auto"}>
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-20 bg-muted font-mono text-xs uppercase tracking-wider text-muted-foreground shadow-sm">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) => {
                        const ids = visibleRows.map((row) => row.id);
                        setSelected((previous) => checked ? [...new Set([...previous, ...ids])] : previous.filter((id) => !ids.includes(id)));
                      }}
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
                {visibleRows.map((row) => (
                  <tr key={row.id} className={`bg-card transition-colors hover:bg-muted/20 ${selected.includes(row.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3">
                      <Checkbox
                        checked={selected.includes(row.id)}
                        onCheckedChange={(checked) =>
                          setSelected((previous) => checked ? [...previous, row.id] : previous.filter((id) => id !== row.id))
                        }
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{row.entry_date}</td>
                    <td className="max-w-sm px-4 py-3">
                      <button type="button" onClick={() => setSelected([row.id])} className="block w-full text-left">
                        <p className="truncate hover:text-primary">{row.description}</p>
                        {row.counterparty && <p className="truncate text-xs text-muted-foreground">{row.counterparty}</p>}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {row.account ? (
                        <>
                          <p>{row.account}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.statement_type === "balanco"
                              ? `Balanço · ${BALANCE_GROUP_LABEL[row.balance_group as BalanceGroup] ?? "Sem grupo"}`
                              : `${NATURE_LABEL[row.nature as Nature]} · ${BEHAVIOR_LABEL[row.behavior as Behavior]}`}
                          </p>
                        </>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.classification_source ?? "—"}
                      <span className="ml-1 font-mono">{row.confidence ? `(${Math.round(row.confidence * 100)}%)` : ""}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono">{brl(Number(row.amount))}</td>
                    <td className="px-4 py-3">
                      <Badge className={statusTone[row.status as EntryStatus]} variant="secondary">
                        {STATUS_LABEL[row.status as EntryStatus]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!entries.isLoading && rows.length === 0 && <p className="p-10 text-center text-sm text-muted-foreground">Nenhum lançamento neste filtro.</p>}
            {entries.isLoading && <p className="p-10 text-center text-sm text-muted-foreground">Carregando...</p>}
          </div>
        </div>

        {selectedRows.length > 0 && (
          <section className="rounded-lg border border-primary/30 bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-display text-sm font-semibold">Workspace de classificação</p>
                <p className="mt-1 text-xs text-muted-foreground">Uma decisão pode ser aplicada a toda a seleção atual.</p>
              </div>
              <Badge variant="secondary">{selected.length} selecionado(s)</Badge>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="space-y-3 rounded-lg border border-border bg-background/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Lançamento</p>
                    <p className="mt-1 break-words text-sm font-medium">{selectedRows[0]!.description}</p>
                  </div>
                  <p className="whitespace-nowrap font-mono text-sm font-semibold">{brl(Number(selectedRows[0]!.amount))}</p>
                </div>
                {selectedRows[0]!.counterparty && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Contraparte</p>
                    <p className="mt-1 break-words text-sm">{selectedRows[0]!.counterparty}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{selectedRows[0]!.entry_date}</Badge>
                  {selectedRows[0]!.account && <Badge variant="outline">{selectedRows[0]!.account}</Badge>}
                  <Badge variant="outline">{STATUS_LABEL[selectedRows[0]!.status as EntryStatus]}</Badge>
                </div>
                {selectedRows.length > 1 && (
                  <p className="text-xs text-muted-foreground">+ {selectedRows.length - 1} lançamento(s) na seleção · impacto absoluto {brl(selectionStats.totalAmount)}</p>
                )}
                {isAutomaticFilter && (
                  <>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline">Resultado (DRE): {selectionStats.resultado}</Badge>
                      <Badge variant="outline">Balanço: {selectionStats.balanco}</Badge>
                      {selectionStats.top.map(([label, count]) => <Badge key={label} variant="secondary">{count}× {label}</Badge>)}
                    </div>
                    {selectionStats.heterogeneous && (
                      <p className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs text-muted-foreground">
                        A seleção contém classificações diferentes. Confirmar mantém cada classificação atual; reclassificar substitui todos pela nova classificação.
                      </p>
                    )}
                  </>
                )}
              </div>

              <div>
                {showClassificationForm ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-2">
                      <Label>Demonstrativo</Label>
                      <Select value={statementType} onValueChange={(value) => setStatementType(value as StatementType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATEMENT_TYPES.map((item) => <SelectItem key={item} value={item}>{STATEMENT_TYPE_LABEL[item]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="account">{statementType === "balanco" ? "Conta patrimonial" : "Conta gerencial"}</Label>
                      <Input id="account" maxLength={120} placeholder={statementType === "balanco" ? "Empréstimos e Financiamentos..." : "Combustível, Salários..."} value={form.account} onChange={(event) => setForm({ ...form, account: event.target.value })} />
                    </div>
                    {statementType === "balanco" ? (
                      <div className="space-y-2">
                        <Label>Grupo patrimonial</Label>
                        <Select value={balanceGroup} onValueChange={(value) => setBalanceGroup(value as BalanceGroup)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{BALANCE_GROUPS.map((group) => <SelectItem key={group} value={group}>{BALANCE_GROUP_LABEL[group]}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label>Natureza</Label>
                          <Select value={form.nature} onValueChange={(value) => setForm({ ...form, nature: value as Nature })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{NATURES.map((nature) => <SelectItem key={nature} value={nature}>{NATURE_LABEL[nature]}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Comportamento</Label>
                          <Select value={form.behavior} onValueChange={(value) => setForm({ ...form, behavior: value as Behavior })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{BEHAVIORS.map((behavior) => <SelectItem key={behavior} value={behavior}>{BEHAVIOR_LABEL[behavior]}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 md:col-span-2 xl:col-span-1">
                          <Label>Área</Label>
                          <Select value={form.area} onValueChange={(value) => setForm({ ...form, area: value })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value={NONE}>Sem área</SelectItem>{AREAS.map((area) => <SelectItem key={area} value={area}>{area}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </>
                    )}
                    {statementType === "resultado" && (
                      <div className="space-y-3 rounded-lg border border-border p-4 md:col-span-2 xl:col-span-4">
                        <div className="flex items-center gap-3">
                          <Switch id="rule" checked={createRule} onCheckedChange={setCreateRule} />
                          <Label htmlFor="rule">Aprender como regra do cliente</Label>
                        </div>
                        {createRule && (
                          <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                            <Select value={ruleField} onValueChange={(value) => setRuleField(value as "description" | "counterparty")}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="description">Padrão na descrição</SelectItem><SelectItem value="counterparty">Fornecedor</SelectItem></SelectContent>
                            </Select>
                            <Input maxLength={200} placeholder="Texto do padrão (opcional)" value={rulePattern} onChange={(event) => setRulePattern(event.target.value)} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">A classificação atual já está pronta. Confirme ou escolha reclassificar.</p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 shadow-2xl backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
            <div className="mr-auto">
              <p className="text-sm font-medium">{selected.length} selecionado(s) · {brl(selectionStats.totalAmount)} de impacto absoluto</p>
              <p className="text-xs text-muted-foreground">Aplique uma decisão à seleção e avance para o próximo grupo.</p>
            </div>
            {isAutomaticFilter && !reclassifyMode && (
              <>
                <Button onClick={() => confirmAutomatic.mutate()} disabled={confirmAutomatic.isPending}>{confirmAutomatic.isPending ? "Confirmando..." : "Confirmar atuais"}</Button>
                <Button variant="secondary" onClick={() => setReclassifyMode(true)}>Reclassificar</Button>
              </>
            )}
            {showClassificationForm && statementType === "resultado" && (
              <Button
                onClick={() => {
                  if (!form.account.trim()) return toast.error("Informe a conta gerencial.");
                  classify.mutate();
                }}
                disabled={classify.isPending}
              >
                {isAutomaticFilter ? "Aplicar nova classificação" : "Confirmar classificação"}
              </Button>
            )}
            {showClassificationForm && statementType === "balanco" && (
              <Button
                onClick={() => {
                  if (!form.account.trim()) return toast.error("Informe a conta patrimonial.");
                  classifyBalance.mutate();
                }}
                disabled={classifyBalance.isPending}
              >
                {classifyBalance.isPending ? "Confirmando..." : "Confirmar no Balanço"}
              </Button>
            )}
            {status === "sugerido" && <Button onClick={() => bulkConfirm.mutate()} disabled={bulkConfirm.isPending}>{bulkConfirm.isPending ? "Confirmando..." : `Aceitar ${selected.length} sugestão(ões)`}</Button>}
            {showClassificationForm && statementType === "resultado" && (
              <Button variant="secondary" onClick={() => ai.mutate()} disabled={ai.isPending}>
                <Sparkles className="mr-2 h-4 w-4" />
                {ai.isPending ? "Consultando IA..." : "Sugerir com IA"}
              </Button>
            )}
            {isAutomaticFilter && reclassifyMode && <Button variant="ghost" onClick={() => setReclassifyMode(false)}>Cancelar reclassificação</Button>}
            <Button variant="ghost" onClick={() => bulkIgnore.mutate()} disabled={bulkIgnore.isPending}>Ignorar da DRE</Button>
            <Button variant="ghost" onClick={() => { setSelected([]); setReclassifyMode(false); }}>Limpar seleção</Button>
          </div>
        </div>
      )}
    </div>
  );
}
