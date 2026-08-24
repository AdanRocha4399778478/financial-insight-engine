import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { STANDARD_FIELDS, brl, type StandardField } from "@/lib/finance";
import {
  buildFromHeaderRow,
  guessMapping,
  normalizeRows,
  parseSpreadsheet,
  type ParsedFile,
} from "@/lib/parse-file";
import { buildDreFacts, detectDreStructure, type DreStructure } from "@/lib/dre-file";
import { commitImport, getSavedMapping } from "@/lib/imports.functions";
import { commitDreImport } from "@/lib/dre-import.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/clientes/$clientId/importar")({
  head: () => ({
    meta: [
      { title: "Importar arquivo — Resultados S/A" },
      {
        name: "description",
        content: "Envio de XLSX, XLS ou CSV com mapeamento automático de colunas e prevenção de duplicidade.",
      },
      { property: "og:title", content: "Importar arquivo — Resultados S/A" },
      { property: "og:description", content: "Importação com mapeamento automático e deduplicação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

const NONE = "__none__";
type Mode = "movimentos" | "dre";

function ImportPage() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchSaved = useServerFn(getSavedMapping);
  const commit = useServerFn(commitImport);
  const commitDre = useServerFn(commitDreImport);

  const [mode, setMode] = useState<Mode>("movimentos");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<StandardField, string>>>({});
  const [structure, setStructure] = useState<DreStructure | null>(null);
  const [periodLabel, setPeriodLabel] = useState("");
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [reused, setReused] = useState(false);
  const [busy, setBusy] = useState(false);

  const applyParsed = async (result: ParsedFile, currentMode: Mode) => {
    setParsed(result);
    if (currentMode === "dre") {
      setStructure(detectDreStructure(result));
      setReused(false);
      return;
    }
    const saved = await fetchSaved({ data: { clientId, signature: result.signature } });
    if (saved) {
      setMapping(saved as Partial<Record<StandardField, string>>);
      setReused(true);
    } else {
      setMapping(guessMapping(result.columns));
      setReused(false);
    }
  };

  const handleFile = async (selected: File) => {
    setBusy(true);
    try {
      const result = await parseSpreadsheet(selected);
      if (!result.rows.length) throw new Error("O arquivo não contém linhas de dados.");
      setFile(selected);
      await applyParsed(result, mode);
      if (!result.confident) {
        toast.warning("Não foi possível identificar o cabeçalho com segurança. Selecione a linha correta.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    } finally {
      setBusy(false);
    }
  };

  const chooseHeaderRow = async (index: number) => {
    if (!parsed) return;
    setBusy(true);
    try {
      await applyParsed(buildFromHeaderRow(parsed.matrix, index), mode);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = async (next: Mode) => {
    setMode(next);
    if (parsed) await applyParsed(parsed, next);
  };

  const normalized = parsed && mode === "movimentos" ? normalizeRows(parsed.rows, mapping) : null;
  const hasRequired =
    Boolean(mapping.entry_date) &&
    Boolean(mapping.description) &&
    (Boolean(mapping.amount) || Boolean(mapping.credit) || Boolean(mapping.debit));

  const dreResult = useMemo(
    () => (parsed && mode === "dre" && structure ? buildDreFacts(parsed.rows, structure) : null),
    [parsed, mode, structure],
  );

  const send = useMutation({
    mutationFn: async () => {
      if (!parsed || !file || !normalized) throw new Error("Selecione um arquivo.");
      return commit({
        data: {
          clientId,
          filename: file.name.slice(0, 255),
          periodLabel: periodLabel.trim() || null,
          signature: parsed.signature,
          mapping: mapping as Record<string, string>,
          allowDuplicates,
          rows: normalized.valid,
        },
      });
    },
    onSuccess: (result) => {
      toast.success(
        `${result.inserted} lançamentos importados · ${result.auto} automáticos · ${result.pending} pendentes`,
      );
      queryClient.invalidateQueries();
      navigate({ to: "/clientes/$clientId/classificacao", params: { clientId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendDre = useMutation({
    mutationFn: async () => {
      if (!parsed || !file || !dreResult || !structure) throw new Error("Selecione um arquivo.");
      return commitDre({
        data: {
          clientId,
          filename: file.name.slice(0, 255),
          periodLabel: periodLabel.trim() || null,
          signature: parsed.signature,
          mapping: {
            account_code: structure.codeColumn ?? "",
            account_name: structure.nameColumn ?? "",
            periods: structure.periods.map((p) => p.column).join("|"),
          },
          facts: dreResult.facts,
        },
      });
    },
    onSuccess: (result) => {
      toast.success(
        `${result.facts} valores importados · ${result.accounts} contas · ${result.toMap} a mapear`,
      );
      queryClient.invalidateQueries();
      if (result.toMap > 0) navigate({ to: "/clientes/$clientId/contas", params: { clientId } });
      else navigate({ to: "/clientes/$clientId/dre", params: { clientId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-8">
        <h2 className="font-display text-lg font-semibold">1. Arquivo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Formatos aceitos: XLSX, XLS e CSV. A leitura acontece no navegador antes do envio.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                key: "movimentos" as const,
                title: "Movimentações financeiras",
                desc: "Extrato ou razão: normalização → classificação → DRE.",
              },
              {
                key: "dre" as const,
                title: "DRE pronta",
                desc: "DRE já consolidada por conta e período: mapeamento → DRE.",
              },
            ]
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => void switchMode(option.key)}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                mode === option.key ? "border-primary bg-primary/10" : "border-border hover:border-primary"
              }`}
            >
              <span className="text-sm font-medium">{option.title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{option.desc}</span>
            </button>
          ))}
        </div>

        <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-12 text-center transition-colors hover:border-primary">
          <UploadCloud className="h-6 w-6 text-primary" />
          <span className="mt-4 text-sm font-medium">
            {file ? file.name : "Clique para selecionar o arquivo"}
          </span>
          <span className="mt-1 text-xs text-muted-foreground">
            {parsed ? `${parsed.rows.length} linhas · ${parsed.columns.length} colunas` : "Nenhum arquivo selecionado"}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) void handleFile(selected);
            }}
          />
        </label>
        {busy && <p className="mt-4 text-sm text-muted-foreground">Lendo arquivo...</p>}
      </section>

      {parsed && (
        <section className="rounded-lg border border-border bg-card p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">2. Linha de cabeçalho</h2>
            <Badge variant={parsed.confident ? "default" : "destructive"}>
              {parsed.confident
                ? `Detectada automaticamente (linha ${parsed.headerRow + 1})`
                : "Selecione manualmente a linha de cabeçalho"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Linhas acima do cabeçalho são tratadas como metadados do arquivo e não são importadas.
          </p>
          <div className="mt-6 space-y-2">
            {parsed.matrix.slice(0, 12).map((line, index) => (
              <button
                key={index}
                type="button"
                onClick={() => void chooseHeaderRow(index)}
                className={`flex w-full items-center gap-3 overflow-hidden rounded-lg border px-4 py-2 text-left text-xs transition-colors ${
                  index === parsed.headerRow
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary"
                }`}
              >
                <span className="font-mono text-muted-foreground">L{index + 1}</span>
                <span className="truncate">
                  {line.map((c) => (c === null || c === undefined ? "" : String(c))).join(" · ") ||
                    "(linha vazia)"}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  {parsed.columns.map((col) => (
                    <th key={col} className="px-3 py-2">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parsed.rows.slice(0, 3).map((row, index) => (
                  <tr key={index}>
                    {parsed.columns.map((col) => (
                      <td key={col} className="max-w-[14rem] truncate px-3 py-2">
                        {row[col] === null || row[col] === undefined ? "—" : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {parsed && mode === "movimentos" && (
        <section className="rounded-lg border border-border bg-card p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">3. Mapeamento de colunas</h2>
            {reused && <Badge>Mapeamento reaproveitado deste layout</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Sugerimos automaticamente pelo nome das colunas. Ajuste o que for necessário — a escolha
            fica salva para os próximos arquivos com o mesmo layout.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STANDARD_FIELDS.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>
                  {field.label}
                  {field.required && <span className="ml-1 text-primary">*</span>}
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
          {!hasRequired && (
            <p className="mt-6 text-sm text-destructive">
              Informe ao menos Data, Descrição e Valor (ou colunas de Crédito/Débito).
            </p>
          )}
        </section>
      )}

      {parsed && mode === "movimentos" && normalized && hasRequired && (
        <section className="rounded-lg border border-border bg-card p-8">
          <h2 className="font-display text-lg font-semibold">4. Pré-visualização e confirmação</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Somente linhas com movimento financeiro (crédito, débito ou valor) viram lançamentos.
            Saldos, cabeçalhos repetidos e linhas sem movimento são descartados.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Linhas lidas", value: String(normalized.summary.read) },
              { label: "Lançamentos válidos", value: String(normalized.summary.valid) },
              { label: "Linhas descartadas", value: String(normalized.summary.discarded) },
              {
                label: `Créditos (${normalized.summary.creditCount})`,
                value: brl(normalized.summary.creditTotal),
              },
              {
                label: `Débitos (${normalized.summary.debitCount})`,
                value: brl(normalized.summary.debitTotal),
              },
              { label: "Movimento líquido", value: brl(normalized.summary.net) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-border p-4">
                <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-2 font-display text-sm font-semibold">{item.value}</p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Descartes: {normalized.summary.discardedNoMovement} sem movimento ·{" "}
            {normalized.summary.discardedRepeatedHeader} cabeçalhos repetidos ·{" "}
            {normalized.summary.discardedInvalid} sem data válida
          </p>

          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {normalized.valid.slice(0, 8).map((row, index) => (
                  <tr key={index}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{row.entry_date}</td>
                    <td className="max-w-xs truncate px-4 py-3">{row.description}</td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-muted-foreground">
                      {row.counterparty ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                      {brl(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="period">Rótulo do período (opcional)</Label>
              <Input
                id="period"
                maxLength={60}
                placeholder="Jan/2025 — Extrato Banco X"
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-border p-4">
              <Switch checked={allowDuplicates} onCheckedChange={setAllowDuplicates} id="dup" />
              <div>
                <Label htmlFor="dup">Importar mesmo com duplicidade</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Por padrão, lançamentos idênticos já existentes são bloqueados.
                </p>
              </div>
            </div>
          </div>

          <Button
            className="mt-8"
            size="lg"
            disabled={send.isPending || normalized.valid.length === 0}
            onClick={() => send.mutate()}
          >
            {send.isPending ? "Processando..." : "Importar e classificar"}
          </Button>
        </section>
      )}

      {parsed && mode === "dre" && structure && (
        <section className="rounded-lg border border-border bg-card p-8">
          <h2 className="font-display text-lg font-semibold">3. Estrutura da DRE</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Detectamos a conta, o nome e as colunas de período. Colunas derivadas (%, Total Geral,
            Média) são ignoradas como fonte primária.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {(
              [
                { key: "codeColumn" as const, label: "Código da conta" },
                { key: "nameColumn" as const, label: "Nome da conta" },
              ]
            ).map((field) => (
              <div key={field.key} className="space-y-2">
                <Label>{field.label}</Label>
                <Select
                  value={structure[field.key] ?? NONE}
                  onValueChange={(value) =>
                    setStructure((prev) =>
                      prev ? { ...prev, [field.key]: value === NONE ? null : value } : prev,
                    )
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

          <div className="mt-6 flex flex-wrap gap-2">
            {structure.periods.map((p) => (
              <Badge key={p.column}>
                {p.label} → {p.period.slice(0, 7)}
              </Badge>
            ))}
            {structure.periods.length === 0 && (
              <p className="text-sm text-destructive">
                Nenhuma coluna de período reconhecida (ex.: Mai/2026). Verifique a linha de cabeçalho.
              </p>
            )}
          </div>
          {structure.ignored.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Colunas ignoradas: {structure.ignored.join(" · ")}
            </p>
          )}
        </section>
      )}

      {parsed && mode === "dre" && dreResult && structure && structure.periods.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-8">
          <h2 className="font-display text-lg font-semibold">4. Validação e confirmação</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Linhas lidas", value: String(parsed.rows.length) },
              { label: "Contas com valor", value: String(dreResult.accounts.length) },
              { label: "Valores por período", value: String(dreResult.facts.length) },
              { label: "Duplicatas idênticas removidas", value: String(dreResult.duplicatesRemoved) },
              { label: "Conflitos de valor", value: String(dreResult.conflicts.length) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-border p-4">
                <p className="font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-2 font-display text-sm font-semibold">{item.value}</p>
              </div>
            ))}
          </div>

          {dreResult.conflicts.length > 0 && (
            <div className="mt-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <p className="font-display text-sm font-semibold">
                Importação bloqueada: mesma conta e período com valores diferentes
              </p>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {dreResult.conflicts.slice(0, 20).map((c) => (
                  <li key={`${c.account_code}-${c.period}`} className="font-mono">
                    {c.account_code} · {c.account_name} · {c.period_label}:{" "}
                    {c.values
                      .map((v) => (v.source_row ? `linha ${v.source_row} = ${brl(v.amount)}` : brl(v.amount)))
                      .join("  vs  ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Conta</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Período</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dreResult.facts.slice(0, 8).map((fact, index) => (
                  <tr key={index}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{fact.account_code}</td>
                    <td className="max-w-xs truncate px-4 py-3">{fact.account_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {fact.period_label}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                      {brl(fact.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 max-w-sm space-y-2">
            <Label htmlFor="dre-period">Rótulo do arquivo (opcional)</Label>
            <Input
              id="dre-period"
              maxLength={60}
              placeholder="DRE Mai—Jun/2026"
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
            />
          </div>

          <Button
            className="mt-8"
            size="lg"
            disabled={
              sendDre.isPending || dreResult.facts.length === 0 || dreResult.conflicts.length > 0
            }
            onClick={() => sendDre.mutate()}
          >
            {sendDre.isPending ? "Processando..." : "Importar DRE pronta"}
          </Button>
        </section>
      )}
    </div>
  );
}
