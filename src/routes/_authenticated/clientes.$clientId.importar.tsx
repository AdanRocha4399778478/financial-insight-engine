import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { STANDARD_FIELDS, brl, type StandardField } from "@/lib/finance";
import { guessMapping, normalizeRows, parseSpreadsheet, type ParsedFile } from "@/lib/parse-file";
import { commitImport, getSavedMapping } from "@/lib/imports.functions";
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

function ImportPage() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchSaved = useServerFn(getSavedMapping);
  const commit = useServerFn(commitImport);

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<StandardField, string>>>({});
  const [periodLabel, setPeriodLabel] = useState("");
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [reused, setReused] = useState(false);
  const [busy, setBusy] = useState(false);

  const applyParsed = async (result: ParsedFile) => {
    setParsed(result);
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
      await applyParsed(result);
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
      await applyParsed(buildFromHeaderRow(parsed.matrix, index));
    } finally {
      setBusy(false);
    }
  };

  const normalized = parsed ? normalizeRows(parsed.rows, mapping) : null;
  const hasRequired =
    Boolean(mapping.entry_date) &&
    Boolean(mapping.description) &&
    (Boolean(mapping.amount) || Boolean(mapping.credit) || Boolean(mapping.debit));


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

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-card p-8">
        <h2 className="font-display text-lg font-semibold">1. Arquivo</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Formatos aceitos: XLSX, XLS e CSV. A leitura acontece no navegador antes do envio.
        </p>
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
            <h2 className="font-display text-lg font-semibold">2. Mapeamento de colunas</h2>
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

      {parsed && normalized && hasRequired && (
        <section className="rounded-lg border border-border bg-card p-8">
          <h2 className="font-display text-lg font-semibold">3. Pré-visualização e confirmação</h2>
          <div className="mt-4 flex flex-wrap gap-6 text-sm">
            <span>
              <strong className="font-display">{normalized.valid.length}</strong> linhas válidas
            </span>
            <span className="text-muted-foreground">
              {normalized.invalid} linhas descartadas (sem data ou sem conteúdo)
            </span>
          </div>

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
    </div>
  );
}
