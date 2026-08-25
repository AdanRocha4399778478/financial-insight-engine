import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseSpreadsheet } from "@/lib/parse-file";
import { parseBandronesTrainingRows } from "@/lib/bandrones-training";
import { parseErinhoTrainingRows } from "@/lib/erinho-training";
import type { TrainingInputRow } from "@/lib/training-import";
import { estimateTrainingCoverage } from "@/lib/training-coverage.functions";
import {
  getTrainingKnowledgeSummary,
  importTrainingExamples,
  previewTrainingExamples,
} from "@/lib/training-import.functions";

export const Route = createFileRoute("/_authenticated/clientes/$clientId/treinamento")({
  component: TrainingPage,
});

type PreviewResult = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof previewTrainingExamples>>>>;
type CoverageResult = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof estimateTrainingCoverage>>>>;
type RejectedRow = { sourceRowNumber: number; reason: string };
type TrainingFormat = "bandrones" | "erinho";

const mismatchLabel = {
  direction_mismatch: "direção diferente",
  partial_identity: "identidade parcial",
  no_candidate: "sem candidato",
} as const;

function detectTrainingFormat(sourceRows: Record<string, unknown>[]): TrainingFormat {
  const first = sourceRows[0] ?? {};
  const keys = new Set(Object.keys(first));
  if (keys.has("Descrição Detalhada") || keys.has("C/D")) return "erinho";
  return "bandrones";
}

function TrainingPage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();
  const previewFn = useServerFn(previewTrainingExamples);
  const coverageFn = useServerFn(estimateTrainingCoverage);
  const importFn = useServerFn(importTrainingExamples);
  const summaryFn = useServerFn(getTrainingKnowledgeSummary);

  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<TrainingInputRow[]>([]);
  const [rejected, setRejected] = useState<RejectedRow[]>([]);
  const [format, setFormat] = useState<TrainingFormat | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [reading, setReading] = useState(false);

  const summary = useQuery({
    queryKey: ["training-summary", clientId],
    queryFn: () => summaryFn({ data: { clientId } }),
  });

  const previewMutation = useMutation({
    mutationFn: async (nextRows: TrainingInputRow[]) => previewFn({ data: { clientId, rows: nextRows } }),
    onSuccess: setPreview,
    onError: (error: Error) => toast.error(error.message),
  });

  const coverageMutation = useMutation({
    mutationFn: async (nextRows: TrainingInputRow[]) => coverageFn({ data: { clientId, rows: nextRows } }),
    onSuccess: setCoverage,
    onError: (error: Error) => toast.error(`Não foi possível estimar cobertura: ${error.message}`),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file || !rows.length) throw new Error("Selecione um arquivo de treinamento válido.");
      return importFn({
        data: {
          clientId,
          sourceFile: file.name.slice(0, 255),
          rows,
        },
      });
    },
    onSuccess: async (result) => {
      toast.success(`${result.inserted} conhecimentos adicionados ao cliente.`);
      setPreview(null);
      setCoverage(null);
      await queryClient.invalidateQueries({ queryKey: ["training-summary", clientId] });
      await Promise.all([
        previewMutation.mutateAsync(rows),
        coverageMutation.mutateAsync(rows),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleFile = async (selected: File) => {
    setReading(true);
    setPreview(null);
    setCoverage(null);
    try {
      const parsedFile = await parseSpreadsheet(selected);
      const detectedFormat = detectTrainingFormat(parsedFile.rows);
      const parsedTraining =
        detectedFormat === "erinho"
          ? parseErinhoTrainingRows(parsedFile.rows)
          : parseBandronesTrainingRows(parsedFile.rows);
      if (!parsedTraining.rows.length) throw new Error("Nenhuma linha válida de treinamento foi encontrada.");
      setFile(selected);
      setFormat(detectedFormat);
      setRows(parsedTraining.rows);
      setRejected(parsedTraining.rejected);
      await Promise.all([
        previewMutation.mutateAsync(parsedTraining.rows),
        coverageMutation.mutateAsync(parsedTraining.rows),
      ]);
    } catch (error) {
      setFile(null);
      setFormat(null);
      setRows([]);
      setRejected([]);
      setCoverage(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    } finally {
      setReading(false);
    }
  };

  const conflicts = preview?.conflicts ?? [];
  const invalidCount = preview?.invalid?.length ?? 0;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Conhecimentos" value={summary.data?.total ?? 0} />
        <Metric label="Históricos únicos" value={summary.data?.historyKeys ?? 0} />
        <Metric label="Contas aprendidas" value={summary.data?.accounts ?? 0} />
        <Metric
          label="Última atualização"
          value={summary.data?.lastUpdatedAt ? new Date(summary.data.lastUpdatedAt).toLocaleDateString("pt-BR") : "—"}
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-xl font-semibold">Treinamento do cliente</h2>
          <p className="text-sm text-muted-foreground">
            Envie a planilha histórica já classificada. O sistema mostra uma prévia e grava somente conhecimentos novos e sem conflito.
          </p>
        </div>

        <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-10 text-center hover:bg-muted/30">
          <UploadCloud className="mb-3 h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium">{file?.name ?? "Selecionar XLSX, XLS ou CSV"}</span>
          <span className="mt-1 text-xs text-muted-foreground">
            {format === "erinho"
              ? "Formato detectado: Grupo Erinho"
              : format === "bandrones"
                ? "Formato detectado: Bandrones"
                : "Formatos suportados: Bandrones e Grupo Erinho"}
          </span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={reading || previewMutation.isPending || coverageMutation.isPending || importMutation.isPending}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) void handleFile(selected);
            }}
          />
        </label>
      </section>

      {preview && (
        <section className="space-y-5 rounded-xl border border-border bg-card p-6">
          <div>
            <h2 className="font-display text-xl font-semibold">Prévia do treinamento</h2>
            <p className="mt-1 text-sm text-muted-foreground">Nenhum dado adicional é gravado até você confirmar.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Metric label="Recebidas" value={preview.received} />
            <Metric label="Novas" value={preview.ready} />
            <Metric label="Repetidas no arquivo" value={preview.duplicatesInBatch} />
            <Metric label="Já conhecidas" value={preview.duplicatesExisting} />
            <Metric label="Conflitos" value={conflicts.length} />
            <Metric label="Inválidas" value={invalidCount + rejected.length} />
          </div>

          {coverage && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-medium">Cobertura estimada sobre pendências atuais</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Simulação sem gravar conhecimento e sem alterar lançamentos.
                  </p>
                </div>
                <div className="font-display text-3xl font-semibold">{coverage.estimatedCoveragePct}%</div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Pendências atuais" value={coverage.totalPending} />
                <Metric label="Matches seguros" value={coverage.safeMatches} />
                <Metric label="Matches conflitantes" value={coverage.conflictMatches} />
                <Metric label="Sem cobertura" value={coverage.uncovered} />
              </div>

              {coverage.mismatchDiagnostics.length > 0 && (
                <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Pendência atual</th>
                        <th className="px-4 py-3">Relação</th>
                        <th className="px-4 py-3">Chave no treinamento</th>
                        <th className="px-4 py-3">Conta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {coverage.mismatchDiagnostics.map((item) => (
                        <tr key={item.pendingKey}>
                          <td className="max-w-xs px-4 py-3 font-mono text-xs">
                            <p className="truncate">{item.pendingKey}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary">{mismatchLabel[item.relation]}</Badge>
                          </td>
                          <td className="max-w-xs px-4 py-3 font-mono text-xs text-muted-foreground">
                            <p className="truncate">{item.candidateKey ?? "—"}</p>
                          </td>
                          <td className="px-4 py-3">{item.candidateAccount ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">Conflitos encontrados</h3>
                <Badge variant="secondary">não serão importados</Badge>
              </div>
              <div className="space-y-2">
                {conflicts.map((conflict) => (
                  <div key={`${conflict.historyKey}-${conflict.reason}`} className="rounded-lg border border-border p-4">
                    <div className="font-mono text-sm">{conflict.historyKey}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {conflict.classifications.map((item, index) => (
                        <Badge key={`${item.account}-${index}`} variant="outline">{item.account}</Badge>
                      ))}
                      {conflict.existing.map((item, index) => (
                        <Badge key={`existing-${item.account}-${index}`} variant="secondary">Já salvo: {item.account}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <p className="text-sm text-muted-foreground">
              Serão adicionados {preview.ready} conhecimentos. Duplicidades, inválidos e conflitos ficam de fora.
            </p>
            <Button
              disabled={preview.ready === 0 || importMutation.isPending}
              onClick={() => importMutation.mutate()}
            >
              {importMutation.isPending ? "Importando..." : `Confirmar ${preview.ready} conhecimentos`}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}
