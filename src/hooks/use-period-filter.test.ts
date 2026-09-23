import { describe, expect, test } from "vitest";
import {
  addMonths,
  closedMonth,
  isValidPeriod,
  nextMonth,
  parsePeriodFromSearchParams,
  periodToRange,
  periodToSearchParams,
  previousMonth,
  type Period,
} from "./use-period-filter";

describe("closedMonth", () => {
  test("retorna o mês anterior ao mês corrente", () => {
    expect(closedMonth(new Date(2026, 8, 15))).toEqual({ year: 2026, month: 8 }); // set/2026 -> ago/2026
  });

  test("vira o ano quando o mês corrente é janeiro", () => {
    expect(closedMonth(new Date(2026, 0, 10))).toEqual({ year: 2025, month: 12 });
  });

  test("funciona em dezembro (mês fechado é novembro do mesmo ano)", () => {
    expect(closedMonth(new Date(2026, 11, 1))).toEqual({ year: 2026, month: 11 });
  });
});

describe("navegação de mês (addMonths / nextMonth / previousMonth)", () => {
  test("nextMonth avança dentro do mesmo ano", () => {
    expect(nextMonth({ year: 2026, month: 5 })).toEqual({ year: 2026, month: 6 });
  });

  test("nextMonth vira o ano em dezembro -> janeiro", () => {
    expect(nextMonth({ year: 2026, month: 12 })).toEqual({ year: 2027, month: 1 });
  });

  test("previousMonth retrocede dentro do mesmo ano", () => {
    expect(previousMonth({ year: 2026, month: 6 })).toEqual({ year: 2026, month: 5 });
  });

  test("previousMonth vira o ano em janeiro -> dezembro do ano anterior", () => {
    expect(previousMonth({ year: 2026, month: 1 })).toEqual({ year: 2025, month: 12 });
  });

  test("addMonths com delta grande cruza múltiplos anos para frente", () => {
    expect(addMonths({ year: 2026, month: 10 }, 15)).toEqual({ year: 2028, month: 1 });
  });

  test("addMonths com delta grande cruza múltiplos anos para trás", () => {
    expect(addMonths({ year: 2026, month: 2 }, -15)).toEqual({ year: 2024, month: 11 });
  });

  test("addMonths com delta zero não muda o período", () => {
    expect(addMonths({ year: 2026, month: 3 }, 0)).toEqual({ year: 2026, month: 3 });
  });
});

describe("periodToRange (formato de datas)", () => {
  test("mês de 31 dias", () => {
    expect(periodToRange({ year: 2026, month: 1 })).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });

  test("mês de 30 dias", () => {
    expect(periodToRange({ year: 2026, month: 4 })).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    });
  });

  test("fevereiro em ano não bissexto", () => {
    expect(periodToRange({ year: 2026, month: 2 })).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });

  test("fevereiro em ano bissexto", () => {
    expect(periodToRange({ year: 2028, month: 2 })).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  test("dezembro (virada de ano dentro do próprio período)", () => {
    expect(periodToRange({ year: 2026, month: 12 })).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });
});

describe("parâmetros de URL (?ano=&mes=)", () => {
  test("round-trip: periodToSearchParams -> parsePeriodFromSearchParams", () => {
    const period: Period = { year: 2026, month: 9 };
    const { ano, mes } = periodToSearchParams(period);
    const params = new URLSearchParams({ ano, mes });
    expect(parsePeriodFromSearchParams(params)).toEqual(period);
  });

  test("mês é sempre gerado com dois dígitos", () => {
    expect(periodToSearchParams({ year: 2026, month: 3 })).toEqual({ ano: "2026", mes: "03" });
  });

  test("retorna null quando faltam parâmetros", () => {
    expect(parsePeriodFromSearchParams(new URLSearchParams())).toBeNull();
    expect(parsePeriodFromSearchParams(new URLSearchParams({ ano: "2026" }))).toBeNull();
  });

  test("retorna null para mês fora do intervalo 1-12", () => {
    expect(parsePeriodFromSearchParams(new URLSearchParams({ ano: "2026", mes: "13" }))).toBeNull();
    expect(parsePeriodFromSearchParams(new URLSearchParams({ ano: "2026", mes: "0" }))).toBeNull();
  });

  test("retorna null para valores não numéricos", () => {
    expect(
      parsePeriodFromSearchParams(new URLSearchParams({ ano: "abcd", mes: "09" })),
    ).toBeNull();
  });
});

describe("isValidPeriod", () => {
  test("aceita período válido", () => {
    expect(isValidPeriod({ year: 2026, month: 1 })).toBe(true);
  });

  test("rejeita mês fora do intervalo, tipos errados e valores ausentes", () => {
    expect(isValidPeriod({ year: 2026, month: 0 })).toBe(false);
    expect(isValidPeriod({ year: 2026, month: 13 })).toBe(false);
    expect(isValidPeriod({ year: "2026", month: 1 })).toBe(false);
    expect(isValidPeriod(null)).toBe(false);
    expect(isValidPeriod({})).toBe(false);
  });
});
