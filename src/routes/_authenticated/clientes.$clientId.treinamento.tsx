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
import {
  getTrainingKnowledgeSummary,
  importTrainingExamples,
  previewTrainingExamples,
} from "@/lib/training-import.functions";

export const Route = createFileRoute("/_authenticated/clientes/$clientId/treinamento")({
  component: TrainingPage,
});

type PreviewResult = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof previewTrainingExamples>>>>;

function TrainingPage() {
  const { clientId } = Route.useParams();
  const queryClient = useQueryClient();
  const previewFn = useServerFn(previewTrainingExamples);
  const importFn = useServerFn(importTrainingExamples);
  const summaryFn = useServerFn(getTrainingKnowledgeSummary);

  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ReturnType<typeof parseBandronesTrainingRows>["rows"]>([]);
  const [rejected, setRejected] = useState<ReturnType<typeof parseBandronesTrainingRows>["rejected"]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [reading, setReading] = useState(false);

  const summary = useQuery({
    queryKey: ["training-summary", clientId],
    queryFn: () => summaryFn({ data: { clientId } }),
  });

  const previewMutation = useMutation({
    mutationFn: async (nextRows: typeof rows) => previewFn({ data: { clientId, rows: nextRows } }),
    onSuccess: setPreview,
    onError: (error: Error) => toast.error(error.message),
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
      await queryClient.invalidateQueries({ queryKey: ["training-summary", clientId] });
      await previewMutation.mutateAsync(rows);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleFile = async (selected: File) => {
    setReading(true);
    setPreview(null);
    try {
      const parsedFile = await parseSpreadsheet(selected);
      const parsedTraining = parseBandronesTrainingRows(parsedFile.rows);
      if (!parsedTraining.rows.length) throw new Error("Nenhuma linha válida de treinamento foi encontrada.");
      setFile(selected);
      setRows(parsedTraining.rows);
      setRejected(parsedTraining.rejected);
      await previewMutation.mutateAsync(parsedTraining.rows);
    } catch (error) {
      setFile(null);
      setRows([]);
      setRejected([]);
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
          <span className="mt-1 text-xs text-muted-foreground">Formato atual: planilha histórica no padrão Bandrones</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            disabled={reading || previewMutation.isPending || importMutation.isPending}
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
