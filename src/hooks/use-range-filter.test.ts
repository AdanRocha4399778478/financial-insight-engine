import { describe, expect, test } from "vitest";
import {
  isValidDateRange,
  parseRangeFromSearchParams,
  rangeToSearchParams,
  rollingMonthsRange,
  shortcutToRange,
  yearToDateRange,
} from "./use-range-filter";

describe("rollingMonthsRange", () => {
  test("3 meses termina no mês corrente e começa 2 meses antes", () => {
    expect(rollingMonthsRange(3, new Date(2026, 8, 15))).toEqual({
      from: "2026-07-01",
      to: "2026-09-30",
    });
  });

  test("6 meses vira o ano quando o intervalo cruza dezembro/janeiro", () => {
    expect(rollingMonthsRange(6, new Date(2026, 1, 10))).toEqual({
      from: "2025-09-01",
      to: "2026-02-28",
    });
  });

  test("respeita fevereiro em ano bissexto no fim do intervalo", () => {
    expect(rollingMonthsRange(1, new Date(2028, 1, 10))).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });
});

describe("yearToDateRange", () => {
  test("retorna 1º de janeiro a 31 de dezembro do ano de referência", () => {
    expect(yearToDateRange(new Date(2026, 5, 1))).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });
});

describe("shortcutToRange", () => {
  const reference = new Date(2026, 8, 15); // set/2026

  test("closed-month usa o mesmo cálculo de mês fechado da DRE", () => {
    expect(shortcutToRange("closed-month", reference)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  test("3m", () => {
    expect(shortcutToRange("3m", reference)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });

  test("6m", () => {
    expect(shortcutToRange("6m", reference)).toEqual({ from: "2026-04-01", to: "2026-09-30" });
  });

  test("year", () => {
    expect(shortcutToRange("year", reference)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});

describe("isValidDateRange", () => {
  test("aceita { from, to } no formato YYYY-MM-DD", () => {
    expect(isValidDateRange({ from: "2026-01-01", to: "2026-01-31" })).toBe(true);
  });

  test("rejeita valores fora do formato ou ausentes", () => {
    expect(isValidDateRange(null)).toBe(false);
    expect(isValidDateRange({ from: "2026-01", to: "2026-01-31" })).toBe(false);
    expect(isValidDateRange({ from: "", to: "" })).toBe(false);
  });
});

describe("parsePeriodFromSearchParams / rangeToSearchParams (round trip)", () => {
  test("ida e volta preserva o intervalo", () => {
    const range = { from: "2026-03-01", to: "2026-05-31" };
    const params = new URLSearchParams(rangeToSearchParams(range));
    expect(parseRangeFromSearchParams(params)).toEqual(range);
  });

  test("retorna null quando os parâmetros estão ausentes", () => {
    expect(parseRangeFromSearchParams(new URLSearchParams())).toBeNull();
  });

  test("retorna null quando os parâmetros estão em formato inválido", () => {
    expect(
      parseRangeFromSearchParams(new URLSearchParams({ from: "invalid", to: "2026-01-31" })),
    ).toBeNull();
  });
});
