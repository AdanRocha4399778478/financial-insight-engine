import { describe, expect, test } from "vitest";
import { prepareDreFactBatch } from "./dre-import-batch";
import type { DreFactRow } from "./dre-file";

const CLIENT_ID = "11111111-1111-1111-1111-111111111111";

function fact(overrides: Partial<DreFactRow> = {}): DreFactRow {
  return {
    account_code: "1.01",
    account_name: "Receita",
    period: "2026-05-01",
    period_label: "Mai/2026",
    amount: 100,
    source_row: 1,
    ...overrides,
  };
}

describe("prepareDreFactBatch", () => {
  test("prepara exatamente um fato por client_id + fingerprint", () => {
    const result = prepareDreFactBatch(CLIENT_ID, [
      fact(),
      fact({ account_code: "1-01", account_name: "  receita  ", source_row: 2 }),
      fact({ account_code: "2.01", account_name: "Custos", amount: -40, source_row: 3 }),
    ]);

    const fingerprints = result.facts.map((prepared) => prepared.fingerprint);
    const databaseKeys = result.facts.map(
      (prepared) => `${prepared.client_id}:${prepared.fingerprint}`,
    );

    expect(result.conflicts).toHaveLength(0);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.facts).toHaveLength(new Set(fingerprints).size);
    expect(result.facts).toHaveLength(new Set(databaseKeys).size);
    expect(result.facts).toHaveLength(2);
  });

  test("bloqueia fatos com o mesmo fingerprint e valores divergentes", () => {
    const result = prepareDreFactBatch(CLIENT_ID, [
      fact({ amount: 100, source_row: 7 }),
      fact({ account_code: "1-01", amount: 125, source_row: 9 }),
    ]);

    expect(result.facts).toHaveLength(0);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.values).toEqual([
      { amount: 100, source_row: 7 },
      { amount: 125, source_row: 9 },
    ]);
  });

  test("bloqueia fatos com o mesmo fingerprint e nomes de conta divergentes", () => {
    const result = prepareDreFactBatch(CLIENT_ID, [
      fact({ account_name: "Receita Bruta", amount: 100, source_row: 4 }),
      fact({
        account_code: "1-01",
        account_name: "Receita de Serviços",
        amount: 100,
        source_row: 6,
      }),
    ]);

    expect(result.facts).toHaveLength(0);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.account_name).toBe("Receita Bruta");
  });

  test("não trata valores diferentes na terceira casa decimal como idênticos", () => {
    const result = prepareDreFactBatch(CLIENT_ID, [
      fact({ amount: 100.001 }),
      fact({ account_code: "1-01", amount: 100.004, source_row: 2 }),
    ]);

    expect(result.conflicts).toHaveLength(1);
    expect(result.facts).toHaveLength(0);
  });

  test("usa o nome como identidade quando códigos simbólicos normalizam para vazio", () => {
    const result = prepareDreFactBatch(CLIENT_ID, [
      fact({
        account_code: "*",
        account_name: "LUCRO LÍQUIDO",
        amount: 136089.91,
        source_row: 77,
      }),
      fact({
        account_code: "+",
        account_name: "PONTO DE EQUILÍBRIO OPERACIONAL",
        amount: 59796.995,
        source_row: 78,
      }),
    ]);

    expect(result.conflicts).toHaveLength(0);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.facts).toHaveLength(2);
    expect(new Set(result.facts.map((prepared) => prepared.fingerprint)).size).toBe(2);
  });
});
