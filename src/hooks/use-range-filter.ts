import { useEffect, useState } from "react";
import { closedMonth, periodToRange, type DateRange } from "./use-period-filter";

export type RangeShortcut = "closed-month" | "3m" | "6m" | "year";

export interface RangeFilterResult {
  range: DateRange;
  /** null quando o range atual veio de edição manual dos campos De/Até. */
  shortcut: RangeShortcut | null;
  setShortcut: (shortcut: RangeShortcut) => void;
  setRange: (range: DateRange) => void;
}

interface StoredRangeFilter {
  shortcut: RangeShortcut | null;
  range: DateRange;
}

const SHORTCUTS: RangeShortcut[] = ["closed-month", "3m", "6m", "year"];

function storageKey(clientId: string): string {
  return `indicadores-range:${clientId}`;
}

export function isValidDateRange(value: unknown): value is DateRange {
  if (!value || typeof value !== "object") return false;
  const candidate = value as DateRange;
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate.from) && /^\d{4}-\d{2}-\d{2}$/.test(candidate.to);
}

function isValidStored(value: unknown): value is StoredRangeFilter {
  if (!value || typeof value !== "object") return false;
  const candidate = value as StoredRangeFilter;
  return (
    isValidDateRange(candidate.range) &&
    (candidate.shortcut === null || SHORTCUTS.includes(candidate.shortcut))
  );
}

/** Últimos N meses fechados até o mês corrente (inclusive), mesma regra usada hoje na DRE/Indicadores. */
export function rollingMonthsRange(months: number, reference: Date = new Date()): DateRange {
  const from = new Date(reference.getFullYear(), reference.getMonth() - months + 1, 1);
  const to = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export function yearToDateRange(reference: Date = new Date()): DateRange {
  return { from: `${reference.getFullYear()}-01-01`, to: `${reference.getFullYear()}-12-31` };
}

export function shortcutToRange(shortcut: RangeShortcut, reference: Date = new Date()): DateRange {
  switch (shortcut) {
    case "closed-month":
      return periodToRange(closedMonth(reference));
    case "3m":
      return rollingMonthsRange(3, reference);
    case "6m":
      return rollingMonthsRange(6, reference);
    case "year":
      return yearToDateRange(reference);
  }
}

export function parseRangeFromSearchParams(params: URLSearchParams): DateRange | null {
  const candidate = { from: params.get("from") ?? "", to: params.get("to") ?? "" };
  return isValidDateRange(candidate) ? candidate : null;
}

export function rangeToSearchParams(range: DateRange): { from: string; to: string } {
  return { from: range.from, to: range.to };
}

export function readStoredRangeFilter(clientId: string): StoredRangeFilter | null {
  try {
    const raw = window.localStorage.getItem(storageKey(clientId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidStored(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredRangeFilter(clientId: string, value: StoredRangeFilter): void {
  try {
    window.localStorage.setItem(storageKey(clientId), JSON.stringify(value));
  } catch {
    // Persistência local é conveniência, não requisito.
  }
}

const DEFAULT_SHORTCUT: RangeShortcut = "closed-month";

function defaultState(): StoredRangeFilter {
  return { shortcut: DEFAULT_SHORTCUT, range: shortcutToRange(DEFAULT_SHORTCUT) };
}

/**
 * Estado de intervalo com atalho (mês fechado / 3 meses / 6 meses / ano) para a
 * tela de Indicadores: mesma infraestrutura de persistência (URL + localStorage
 * por clientId) do usePeriodFilter, mas o valor guardado é um DateRange livre em
 * vez de um único mês — Indicadores aceita qualquer intervalo.
 */
export function useRangeFilter(clientId: string): RangeFilterResult {
  const [state, setState] = useState<StoredRangeFilter>(defaultState);
  const [readyClientId, setReadyClientId] = useState<string | null>(null);

  useEffect(() => {
    if (readyClientId === clientId) return;

    const params = new URLSearchParams(window.location.search);
    const fromUrl = parseRangeFromSearchParams(params);
    if (fromUrl) {
      setState({ shortcut: null, range: fromUrl });
      setReadyClientId(clientId);
      return;
    }

    const stored = readStoredRangeFilter(clientId);
    if (stored) {
      setState(stored);
      setReadyClientId(clientId);
      return;
    }

    setState(defaultState());
    setReadyClientId(clientId);
  }, [clientId, readyClientId]);

  useEffect(() => {
    if (readyClientId !== clientId) return;

    writeStoredRangeFilter(clientId, state);

    const url = new URL(window.location.href);
    const { from, to } = rangeToSearchParams(state.range);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [clientId, state, readyClientId]);

  return {
    range: state.range,
    shortcut: state.shortcut,
    setShortcut: (shortcut) => setState({ shortcut, range: shortcutToRange(shortcut) }),
    setRange: (range) => setState({ shortcut: null, range }),
  };
}
