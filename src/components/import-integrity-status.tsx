import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, CircleHelp, Sigma } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { brl } from "@/lib/finance";

export type IntegrityStatus =
  | "conciliado"
  | "divergente"
  | "fechamento_inferido"
  | "nao_verificado"
  | null;

interface ImportIntegrityStatusProps {
  clientId: string;
  status: IntegrityStatus;
  filename?: string | null;
  checkedAt?: string | null;
  difference?: number | null;
  compact?: boolean;
}

function statusMeta(status: IntegrityStatus) {
  if (status === "conciliado") {
    return {
      label: "Base conciliada",
      detail: "A última importação foi validada matematicamente com saldos independentes.",
      badge: "CONCILIADA",
      variant: "default" as const,
      Icon: CheckCircle2,
      iconClass: "text-primary",
    };
  }
  if (status === "fechamento_inferido") {
    return {
      label: "Base com ressalva",
      detail: "O fechamento matemático foi inferido. Os números podem ser analisados, mas ainda não equivalem a uma conciliação bancária independente.",
      badge: "RESSALVA",
      variant: "secondary" as const,
      Icon: Sigma,
      iconClass: "text-muted-foreground",
    };
  }
  if (status === "divergente") {
    return {
      label: "Base divergente",
      detail: "A última importação não fecha matematicamente. Revise a integridade antes de tratar os números como financeiramente validados.",
      badge: "DIVERGENTE",
      variant: "destructive" as const,
      Icon: AlertTriangle,
      iconClass: "text-destructive",
    };
  }
  if (status === "nao_verificado") {
    return {
      label: "Base não verificada",
      detail: "Não houve evidência suficiente para validar os saldos da última importação.",
      badge: "REVISAR",
      variant: "outline" as const,
      Icon: CircleHelp,
      iconClass: "text-muted-foreground",
    };
  }
  return {
    label: "Qualidade da base não avaliada",
    detail: "A importação é anterior ao controle de integridade ou ainda não possui verificação matemática.",
    badge: "SEM AVALIAÇÃO",
    variant: "outline" as const,
    Icon: CircleHelp,
    iconClass: "text-muted-foreground",
  };
}

export function ImportIntegrityStatus({
  clientId,
  status,
  filename,
  checkedAt,
  difference,
  compact = false,
}: ImportIntegrityStatusProps) {
  const meta = statusMeta(status);
  const Icon = meta.Icon;

  return (
    <div
      className={`rounded-lg border border-border bg-card ${compact ? "px-4 py-3" : "p-5"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.iconClass}`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-sm font-semibold">Qualidade da base financeira</p>
              <Badge variant={meta.variant}>{meta.badge}</Badge>
            </div>
            <p className="mt-1 text-sm font-medium">{meta.label}</p>
            {!compact && <p className="mt-1 max-w-3xl text-xs text-muted-foreground">{meta.detail}</p>}
            {(filename || checkedAt) && (
              <p className="mt-2 text-xs text-muted-foreground">
                {filename ?? "Última importação"}
                {checkedAt ? ` · conferida em ${new Date(checkedAt).toLocaleString("pt-BR")}` : ""}
                {status === "divergente" && difference !== null && difference !== undefined
                  ? ` · diferença ${brl(difference)}`
                  : ""}
              </p>
            )}
          </div>
        </div>
        <Link
          to="/clientes/$clientId/governanca"
          params={{ clientId }}
          className="font-mono text-[0.7rem] uppercase tracking-widest text-primary hover:underline"
        >
          Ver governança →
        </Link>
      </div>
    </div>
  );
}
