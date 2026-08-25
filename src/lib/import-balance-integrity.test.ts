import { describe, expect, it } from "vitest";
import {
  calculateImportBalanceIntegrity,
  inferBalancesFromRunningBalance,
  inferStatementBalances,
} from "./import-balance-integrity";

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

describe("statement balance inference", () => {
  it("uses explicit opening and closing labels", () => {
    expect(
      inferStatementBalances([
        { description: "Saldo anterior", value: 1000 },
        { description: "Saldo final", value: 1250 },
      ]),
    ).toMatchObject({ openingBalance: 1000, closingBalance: 1250 });
  });

  it("uses the last daily balance as closing only when an opening balance exists", () => {
    expect(
      inferStatementBalances([
        { description: "SALDO INICIAL", value: 1000 },
        { description: "SALDO DO DIA", value: 1100 },
        { description: "SALDO DO DIA", value: 1250 },
      ]),
    ).toMatchObject({ openingBalance: 1000, closingBalance: 1250 });
  });

  it("does not guess from ambiguous balance rows", () => {
    expect(
      inferStatementBalances([
        { description: "SALDO", value: 1000 },
        { description: "SALDO", value: 1250 },
      ]),
    ).toMatchObject({ openingBalance: null, closingBalance: null });
  });
});

describe("running balance inference", () => {
  it("infers opening and closing balances from ascending rows", () => {
    expect(
      inferBalancesFromRunningBalance([
        { amount: 100, balance: 1100 },
        { amount: -50, balance: 1050 },
        { amount: 200, balance: 1250 },
      ]),
    ).toMatchObject({ openingBalance: 1000, closingBalance: 1250 });
  });

  it("infers opening and closing balances from descending rows", () => {
    expect(
      inferBalancesFromRunningBalance([
        { amount: 200, balance: 1250 },
        { amount: -50, balance: 1050 },
        { amount: 100, balance: 1100 },
      ]),
    ).toMatchObject({ openingBalance: 1000, closingBalance: 1250 });
  });

  it("refuses to infer when the running balance is inconsistent", () => {
    expect(
      inferBalancesFromRunningBalance([
        { amount: 100, balance: 1100 },
        { amount: -50, balance: 900 },
        { amount: 200, balance: 1400 },
      ]),
    ).toMatchObject({ openingBalance: null, closingBalance: null });
  });
});
