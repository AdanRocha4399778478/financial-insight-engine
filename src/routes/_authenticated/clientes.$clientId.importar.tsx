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
import {
  calculateImportBalanceIntegrity,
  inferStatementBalances,
} from "@/lib/import-balance-integrity";
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

function parseManualBalance(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let normalized = trimmed.replace(/[R$\s]/g, "");
  const negative = /^\(.*\)$/.test(normalized) || normalized.startsWith("-");
  normalized = normalized.replace(/[()\-]/g, "");

  if (normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  const parsed = Number(normalized.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

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
  const [manualOpeningBalance, setManualOpeningBalance] = useState("");
  const [manualClosingBalance, setManualClosingBalance] = useState("");

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
      setManualOpeningBalance("");
      setManualClosingBalance("");
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

  const inferredBalances = normalized
    ? inferStatementBalances(normalized.summary.balanceRows)
    : null;
  const manualOpeningValue = parseManualBalance(manualOpeningBalance);
  const manualClosingValue = parseManualBalance(manualClosingBalance);
  const openingFromRunningBalance = Boolean(inferredBalances?.openingSource?.includes("COLUNA SALDO"));
  const closingFromRunningBalance = Boolean(inferredBalances?.closingSource?.includes("COLUNA SALDO"));
  const effectiveOpeningBalance = manualOpeningValue ?? inferredBalances?.openingBalance ?? null;
  const effectiveClosingBalance = manualClosingValue ?? inferredBalances?.closingBalance ?? null;
  const openingIndependent = manualOpeningValue !== null || Boolean(inferredBalances?.openingSource && !openingFromRunningBalance);
  const closingIndependent = manualClosingValue !== null || Boolean(inferredBalances?.closingSource && !closingFromRunningBalance);

  const balanceIntegrity = normalized
    ? calculateImportBalanceIntegrity({
        openingBalance: effectiveOpeningBalance,
        closingBalance: effectiveClosingBalance,
        creditTotal: normalized.summary.creditTotal,
        debitTotal: normalized.summary.debitTotal,
        openingIndependent,
        closingIndependent,
      })
    : null;

  const openingSourceLabel = manualOpeningValue !== null
    ? "Informado manualmente"
    : balanceIntegrity?.openingBalance !== null && inferredBalances?.openingBalance === null
      ? "Inferido matematicamente"
      : openingFromRunningBalance
        ? "Inferido matematicamente pela coluna de saldo"
        : inferredBalances?.openingSource
          ? "Detectado no extrato"
          : "Não identificado";

  const closingSourceLabel = manualClosingValue !== null
    ? "Informado manualmente"
    : balanceIntegrity?.closingBalance !== null && inferredBalances?.closingBalance === null
      ? "Inferido matematicamente"
      : closingFromRunningBalance
        ? "Detectado no extrato pela coluna de saldo"
        : inferredBalances?.closingSource
          ? "Detectado no extrato"
          : "Não identificado";

  const openingSource = manualOpeningValue !== null
    ? "manual" as const
    : inferredBalances?.openingBalance !== null
      ? openingFromRunningBalance ? "inferido" as const : "extrato" as const
      : balanceIntegrity?.openingBalance !== null
        ? "inferido" as const
        : null;
  const closingSource = manualClosingValue !== null
    ? "manual" as const
    : inferredBalances?.closingBalance !== null
      ? closingFromRunningBalance ? "inferido" as const : "extrato" as const
      : balanceIntegrity?.closingBalance !== null
        ? "inferido" as const
        : null;

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
          integrityEvidence: balanceIntegrity
            ? {
                openingBalance: balanceIntegrity.openingBalance,
                closingBalance: balanceIntegrity.closingBalance,
                openingSource,
                closingSource,
                openingIndependent,
                closingIndependent,
                creditTotal: normalized.summary.creditTotal,
                debitTotal: normalized.summary.debitTotal,
                tolerance: balanceIntegrity.tolerance,
              }
            : null,
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
        <details
          open={!parsed.confident}
          className="rounded-lg border border-border bg-card p-5"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">2. Cabeçalho</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {parsed.confident
                  ? `Linha ${parsed.headerRow + 1} detectada automaticamente.`
                  : "Selecione manualmente a linha correta."}
              </p>
            </div>

            <Badge variant={parsed.confident ? "default" : "destructive"}>
              {parsed.confident
                ? "Cabeçalho pronto · Revisar"
                : "Revisão necessária"}
            </Badge>
          </summary>

          <div className="mt-5">
            <p className="text-sm text-muted-foreground">
              Linhas acima do cabeçalho são tratadas como metadados e não são importadas.
            </p>

            <div className="mt-4 space-y-2">
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
                  <span className="font-mono text-muted-foreground">
                    L{index + 1}
                  </span>

                  <span className="truncate">
                    {line
                      .map((c) =>
                        c === null || c === undefined ? "" : String(c),
                      )
                      .join(" · ") || "(linha vazia)"}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 overflow-x-auto rounded-lg border border-border">
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
                        <td
                          key={col}
                          className="max-w-[14rem] truncate px-3 py-2"
                        >
                          {row[col] === null || row[col] === undefined
                            ? "—"
                            : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}

      {parsed && mode === "movimentos" && (
        <section className="rounded-lg border border-border bg-card p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold">3. Mapeamento de colunas</h2>
            {reused && <Badge variant="secondary">Mapeamento reaproveitado deste layout</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Associe as colunas do arquivo aos campos do sistema. Data, descrição e valor são obrigatórios.
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
                    setMapping((previous) => ({
                      ...previous,
                      [field.key]: value === NONE ? undefined : value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não usar</SelectItem>
                    {parsed.columns.map((column) => (
                      <SelectItem key={column} value={column}>
                        {column}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Competência/período (opcional)</Label>
              <Input
                placeholder="Ex.: Jan/2026"
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-3 rounded-lg border border-border px-4 py-3">
              <div className="flex-1">
                <Label>Permitir duplicidades</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Desative para ignorar lançamentos que já existem para este cliente.
                </p>
              </div>
              <Switch checked={allowDuplicates} onCheckedChange={setAllowDuplicates} />
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Documento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(normalized?.valid ?? []).slice(0, 5).map((row, index) => (
                  <tr key={`${row.entry_date}-${index}`}>
                    <td className="px-3 py-2">{row.entry_date}</td>
                    <td className="max-w-[20rem] truncate px-3 py-2">{row.description}</td>
                    <td className="px-3 py-2">{brl(row.amount)}</td>
                    <td className="px-3 py-2">{row.document ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {normalized && (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Linhas lidas</p>
                  <p className="mt-1 text-xl font-semibold">{normalized.summary.read}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Lançamentos válidos</p>
                  <p className="mt-1 text-xl font-semibold">{normalized.summary.valid}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Entradas</p>
                  <p className="mt-1 text-xl font-semibold">{brl(normalized.summary.creditTotal)}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Saídas</p>
                  <p className="mt-1 text-xl font-semibold">{brl(normalized.summary.debitTotal)}</p>
                </div>
              </div>

              {balanceIntegrity && (
                <div className="rounded-lg border border-border p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium">Integridade da importação</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Conferência matemática entre saldo inicial, movimentações e saldo final.
                      </p>
                    </div>
                    <Badge
                      variant={
                        balanceIntegrity.status === "conciliado"
                          ? "default"
                          : balanceIntegrity.status === "divergente"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {balanceIntegrity.status === "conciliado"
                        ? "CONCILIADO"
                        : balanceIntegrity.status === "divergente"
                          ? "DIVERGENTE"
                          : balanceIntegrity.status === "fechamento_inferido"
                            ? "FECHAMENTO INFERIDO"
                            : "NÃO VERIFICADO"}
                    </Badge>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Saldo inicial informado (opcional)</Label>
                      <Input
                        placeholder="Ex.: 1.234,56"
                        value={manualOpeningBalance}
                        onChange={(e) => setManualOpeningBalance(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Saldo final informado (opcional)</Label>
                      <Input
                        placeholder="Ex.: 2.345,67"
                        value={manualClosingBalance}
                        onChange={(e) => setManualClosingBalance(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Saldo inicial</p>
                      <p className="mt-1 font-medium">{balanceIntegrity.openingBalance === null ? "—" : brl(balanceIntegrity.openingBalance)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{openingSourceLabel}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Entradas</p>
                      <p className="mt-1 font-medium">{brl(normalized.summary.creditTotal)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Movimentos normalizados</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Saídas</p>
                      <p className="mt-1 font-medium">{brl(normalized.summary.debitTotal)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Movimentos normalizados</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Saldo calculado</p>
                      <p className="mt-1 font-medium">{balanceIntegrity.calculatedBalance === null ? "—" : brl(balanceIntegrity.calculatedBalance)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Cálculo da importação</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Saldo final</p>
                      <p className="mt-1 font-medium">{balanceIntegrity.closingBalance === null ? "—" : brl(balanceIntegrity.closingBalance)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{closingSourceLabel}</p>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">Diferença</p>
                      <p className="mt-1 font-medium">{balanceIntegrity.difference === null ? "—" : brl(balanceIntegrity.difference)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">Banco menos calculado</p>
                    </div>
                  </div>

                  <p className="mt-4 text-xs text-muted-foreground">
                    {balanceIntegrity.status === "conciliado"
                      ? "Os saldos independentes fecham com as movimentações dentro da tolerância de R$ 0,01."
                      : balanceIntegrity.status === "divergente"
                        ? "Os saldos independentes não fecham com as movimentações. Revise mapeamento, período, sinais e linhas descartadas."
                        : balanceIntegrity.status === "fechamento_inferido"
                          ? "O fechamento matemático foi obtido, mas pelo menos um dos saldos foi inferido. Isso não substitui uma conciliação bancária com duas evidências independentes."
                          : "Não há evidência suficiente para determinar os dois saldos com segurança. Informe os saldos manualmente ou utilize um extrato com saldos identificáveis para realizar a conferência."}
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  disabled={!hasRequired || send.isPending || normalized.valid.length === 0}
                  onClick={() => send.mutate()}
                >
                  {send.isPending ? "Importando..." : "Importar e classificar"}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {parsed && mode === "dre" && (
        <section className="rounded-lg border border-border bg-card p-8">
          <h2 className="font-display text-lg font-semibold">3. Estrutura da DRE</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirme a estrutura detectada antes de importar os fatos consolidados.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Coluna da conta</Label>
              <Input value={structure?.nameColumn ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Código da conta</Label>
              <Input value={structure?.codeColumn ?? ""} readOnly />
            </div>
            <div className="space-y-2">
              <Label>Períodos detectados</Label>
              <Input value={structure?.periods.length ?? 0} readOnly />
            </div>
          </div>

          {dreResult && (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Contas</p>
                  <p className="mt-1 text-xl font-semibold">{dreResult.accounts.length}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Períodos</p>
                  <p className="mt-1 text-xl font-semibold">{structure?.periods.length ?? 0}</p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Valores</p>
                  <p className="mt-1 text-xl font-semibold">{dreResult.facts.length}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button disabled={sendDre.isPending || dreResult.facts.length === 0} onClick={() => sendDre.mutate()}>
                  {sendDre.isPending ? "Importando..." : "Importar DRE"}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
