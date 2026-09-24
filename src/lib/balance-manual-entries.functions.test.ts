import { describe, expect, test } from "vitest";
import { assertAccountBelongsToClient, toManualEntryValues } from "./balance-manual-entries.functions";

describe("assertAccountBelongsToClient", () => {
  test("rejeita quando accountId pertence a um client_id diferente do informado", () => {
    expect(() => assertAccountBelongsToClient("client-A", "client-B")).toThrow(
      "Esta conta pertence a outro cliente.",
    );
  });

  test("não lança quando o client_id da conta bate com o informado", () => {
    expect(() => assertAccountBelongsToClient("client-A", "client-A")).not.toThrow();
  });
});

describe("toManualEntryValues", () => {
  test("ausência de lançamento num mês não vira zero — meses sem linha simplesmente não aparecem", () => {
    const rows = [
      { account_id: "acc-1", period: "2026-01-01", value: 100, updated_at: "2026-01-05T00:00:00Z", updated_by: null },
      { account_id: "acc-1", period: "2026-03-01", value: 300, updated_at: "2026-03-05T00:00:00Z", updated_by: null },
    ];

    const result = toManualEntryValues(rows);

    expect(result).toHaveLength(2);
    expect(result.find((r) => r.period === "2026-02-01")).toBeUndefined();
    expect(result.every((r) => r.value !== 0)).toBe(true);
  });

  test("preserva o valor real quando ele é legitimamente zero (não confundir com ausência)", () => {
    const rows = [
      { account_id: "acc-1", period: "2026-01-01", value: 0, updated_at: "2026-01-05T00:00:00Z", updated_by: "user-1" },
    ];

    const result = toManualEntryValues(rows);

    expect(result).toHaveLength(1);
    expect(result[0]!.value).toBe(0);
  });

  test("converte value numeric (string do Postgres) para number", () => {
    const rows = [
      { account_id: "acc-1", period: "2026-01-01", value: "1234.56", updated_at: "2026-01-05T00:00:00Z", updated_by: null },
    ];

    const result = toManualEntryValues(rows);

    expect(result[0]!.value).toBe(1234.56);
  });

  test("array vazio retorna array vazio, sem inventar linhas", () => {
    expect(toManualEntryValues([])).toEqual([]);
  });
});
