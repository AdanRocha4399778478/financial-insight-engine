import { describe, expect, it } from "vitest";
import { calculateImportBalanceIntegrity } from "./import-balance-integrity";

describe("import balance integrity", () => {
  it("marks reconciled when calculated balance matches closing balance", () => {
    const result = calculateImportBalanceIntegrity({
      openingBalance: 1000,
      closingBalance: 1250,
      creditTotal: 500,
      debitTotal: 250,
    });

    expect(result.status).toBe("conciliado");
    expect(result.calculatedBalance).toBe(1250);
    expect(result.difference).toBe(0);
  });

  it("marks divergent when the closing balance differs beyond tolerance", () => {
    const result = calculateImportBalanceIntegrity({
      openingBalance: 1000,
      closingBalance: 1249.5,
      creditTotal: 500,
      debitTotal: 250,
    });

    expect(result.status).toBe("divergente");
    expect(result.calculatedBalance).toBe(1250);
    expect(result.difference).toBe(-0.5);
    expect(result.absoluteDifference).toBe(0.5);
  });

  it("accepts differences within the configured tolerance", () => {
    const result = calculateImportBalanceIntegrity({
      openingBalance: 1000,
      closingBalance: 1250.01,
      creditTotal: 500,
      debitTotal: 250,
      tolerance: 0.01,
    });

    expect(result.status).toBe("conciliado");
  });

  it("returns not verified when opening or closing balance is missing", () => {
    const result = calculateImportBalanceIntegrity({
      openingBalance: null,
      closingBalance: 1250,
      creditTotal: 500,
      debitTotal: 250,
    });

    expect(result.status).toBe("nao_verificado");
    expect(result.calculatedBalance).toBeNull();
    expect(result.difference).toBeNull();
  });
});
