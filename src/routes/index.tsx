import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileSpreadsheet, GitBranch, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand-mark";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Resultados S/A — DRE gerencial a partir dos seus arquivos" },
      {
        name: "description",
        content:
          "Importe XLSX, XLS ou CSV e receba DRE e indicadores gerenciais confiáveis, com classificação automática por regras, histórico e IA — sem Power BI nem planilhas manuais.",
      },
      { property: "og:title", content: "Resultados S/A — DRE gerencial a partir dos seus arquivos" },
      {
        property: "og:description",
        content: "De arquivo financeiro a DRE validada em minutos, com rastreabilidade total.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const steps = [
  {
    icon: FileSpreadsheet,
    title: "Importe o arquivo",
    text: "XLSX, XLS ou CSV. As colunas são reconhecidas automaticamente e o mapeamento fica salvo para o próximo envio.",
  },
  {
    icon: GitBranch,
    title: "Classificação em cascata",
    text: "Regras confirmadas do cliente, histórico, padrões do segmento e, só em último caso, IA — sempre com confiança medida.",
  },
  {
    icon: ShieldCheck,
    title: "Pendências sob controle",
    text: "O que não atinge confiança suficiente vira pendência explícita. Nada entra na DRE sem base validada.",
  },
  {
    icon: Sparkles,
    title: "DRE e indicadores",
    text: "Resultado gerencial com drill-down até o lançamento de origem, margens, EBITDA e ponto de equilíbrio.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandMark />
        <Button asChild variant="ghost" size="sm">
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-12 md:pt-20">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
            Inteligência financeira gerencial
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">
            Do arquivo do cliente à DRE confiável,
            <span className="text-primary"> sem planilha manual.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            A plataforma da Resultados S/A transforma extratos e relatórios financeiros em informação
            gerencial classificada, auditável e pronta para a reunião com o cliente.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                Acessar plataforma <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <dl className="mt-16 grid gap-6 border-t border-border pt-10 sm:grid-cols-3">
            {[
              ["Menos retrabalho", "Cada confirmação vira regra e acelera a próxima importação."],
              ["Zero duplicidade", "Impressão digital por lançamento bloqueia reimportações."],
              ["Rastreabilidade", "Todo valor da DRE abre até o lançamento original do arquivo."],
            ].map(([title, text]) => (
              <div key={title}>
                <dt className="font-display text-sm font-semibold text-primary">{title}</dt>
                <dd className="mt-2 text-sm text-muted-foreground">{text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t border-border bg-card/40">
          <div className="mx-auto grid max-w-6xl gap-px bg-border px-6 py-px sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.title} className="bg-background p-8">
                <s.icon className="h-5 w-5 text-primary" />
                <h2 className="mt-5 font-display text-base font-semibold">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-xs text-muted-foreground">
        Resultados S/A — uso interno de consultoria.
      </footer>
    </div>
  );
}
