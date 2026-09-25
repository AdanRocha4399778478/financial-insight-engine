import { useEffect, useMemo, useState } from "react";

export interface Period {
  year: number;
  /** 1-12. */
  month: number;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface UsePeriodFilterResult {
  period: Period;
  range: DateRange;
  setMonth: (year: number, month: number) => void;
  nextMonth: () => void;
  previousMonth: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function storageKey(clientId: string, namespace: string): string {
  return `${namespace}:${clientId}`;
}

export function isValidPeriod(value: unknown): value is Period {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Period;
  return (
    Number.isInteger(candidate.year) &&
    Number.isInteger(candidate.month) &&
    candidate.month >= 1 &&
    candidate.month <= 12
  );
}

/** Mês fechado: o mês anterior ao mês corrente (o mês corrente ainda não fechou). */
export function closedMonth(reference: Date = new Date()): Period {
  const previous = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  return { year: previous.getFullYear(), month: previous.getMonth() + 1 };
}

/** Desloca um período em `delta` meses, virando o ano corretamente para qualquer direção. */
export function addMonths(period: Period, delta: number): Period {
  const date = new Date(period.year, period.month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function nextMonth(period: Period): Period {
  return addMonths(period, 1);
}

export function previousMonth(period: Period): Period {
  return addMonths(period, -1);
}

/** Mesmo formato { from, to } (YYYY-MM-DD) usado por dre.tsx e indicadores.tsx. */
export function periodToRange(period: Period): DateRange {
  const from = new Date(period.year, period.month - 1, 1);
  const to = new Date(period.year, period.month, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function periodToSearchParams(period: Period): { ano: string; mes: string } {
  return { ano: String(period.year), mes: pad2(period.month) };
}

export function parsePeriodFromSearchParams(params: URLSearchParams): Period | null {
  const anoRaw = params.get("ano");
  const mesRaw = params.get("mes");
  if (!anoRaw || !mesRaw) return null;
  const candidate = { year: Number(anoRaw), month: Number(mesRaw) };
  return isValidPeriod(candidate) ? candidate : null;
}

export function readStoredPeriod(clientId: string, namespace: string = "period-filter"): Period | null {
  try {
    const raw = window.localStorage.getItem(storageKey(clientId, namespace));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidPeriod(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredPeriod(
  clientId: string,
  period: Period,
  namespace: string = "period-filter",
): void {
  try {
    window.localStorage.setItem(storageKey(clientId, namespace), JSON.stringify(period));
  } catch {
    // Persistência local é conveniência, não requisito.
  }
}

/**
 * Estado compartilhado de período (ano/mês) entre telas: lê da URL (?ano=&mes=),
 * cai para localStorage por clientId, e por fim para o mês fechado anterior ao
 * corrente. Ainda não é usado por nenhuma tela — Fase 1 (fundação) do plano de
 * unificação de filtro de período.
 */
export function usePeriodFilter(
  clientId: string,
  storageNamespace: string = "period-filter",
): UsePeriodFilterResult {
  const [period, setPeriod] = useState<Period>(() => closedMonth());
  const [readyClientId, setReadyClientId] = useState<string | null>(null);

  useEffect(() => {
    if (readyClientId === clientId) return;

    const params = new URLSearchParams(window.location.search);
    const fromUrl = parsePeriodFromSearchParams(params);
    if (fromUrl) {
      setPeriod(fromUrl);
      setReadyClientId(clientId);
      return;
    }

    const stored = readStoredPeriod(clientId, storageNamespace);
    if (stored) {
      setPeriod(stored);
      setReadyClientId(clientId);
      return;
    }

    setPeriod(closedMonth());
    setReadyClientId(clientId);
  }, [clientId, readyClientId, storageNamespace]);

  useEffect(() => {
    if (readyClientId !== clientId) return;

    writeStoredPeriod(clientId, period, storageNamespace);

    const url = new URL(window.location.href);
    const { ano, mes } = periodToSearchParams(period);
    url.searchParams.set("ano", ano);
    url.searchParams.set("mes", mes);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [clientId, period, readyClientId, storageNamespace]);

  const range = useMemo(() => periodToRange(period), [period]);

  return {
    period,
    range,
    setMonth: (year, month) => setPeriod({ year, month }),
    nextMonth: () => setPeriod((p) => nextMonth(p)),
    previousMonth: () => setPeriod((p) => previousMonth(p)),
  };
}
