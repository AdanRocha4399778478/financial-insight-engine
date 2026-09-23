import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Period } from "@/hooks/use-period-filter";

const MONTH_LABEL = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export interface PeriodNavProps {
  period: Period;
  onNext: () => void;
  onPrevious: () => void;
}

export function PeriodNav({ period, onNext, onPrevious }: PeriodNavProps) {
  const label = `${MONTH_LABEL[period.month - 1]} ${period.year}`;

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Mês anterior"
        onClick={onPrevious}
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-[10rem] text-center font-mono text-sm font-medium">{label}</span>
      <Button type="button" variant="outline" size="icon" aria-label="Próximo mês" onClick={onNext}>
        <ChevronRight />
      </Button>
    </div>
  );
}
