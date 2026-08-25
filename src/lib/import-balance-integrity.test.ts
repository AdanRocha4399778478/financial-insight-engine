import { describe, expect, it } from "vitest";
import {
  calculateImportBalanceIntegrity,
  inferBalancesFromRunningBalance,
  inferStatementBalances,
} from "./import-balance-integrity";

describe("import balance integrity", () => {
  it("marks reconciled when two independent balances match", () => {
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

  it("marks divergent when independent balances do not match", () => {
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

  it("marks inferred closure when only closing balance is independent", () => {
    const result = calculateImportBalanceIntegrity({
      openingBalance: null,
      closingBalance: 1250,
      creditTotal: 500,
      debitTotal: 250,
      openingIndependent: false,
      closingIndependent: true,
    });

    expect(result.status).toBe("fechamento_inferido");
    expect(result.openingBalance).toBe(1000);
    expect(result.closingBalance).toBe(1250);
    expect(result.calculatedBalance).toBe(1250);
    expect(result.difference).toBeNull();
  });

  it("marks inferred closure when only opening balance is independent", () => {
    const result = calculateImportBalanceIntegrity({
      openingBalance: 1000,
      closingBalance: null,
      creditTotal: 500,
      debitTotal: 250,
      openingIndependent: true,
      closingIndependent: false,
    });

    expect(result.status).toBe("fechamento_inferido");
    expect(result.openingBalance).toBe(1000);
    expect(result.closingBalance).toBe(1250);
  });

  it("returns not verified when neither balance is available", () => {
    const result = calculateImportBalanceIntegrity({
      openingBalance: null,
      closingBalance: null,
      creditTotal: 500,
      debitTotal: 250,
      openingIndependent: false,
      closingIndependent: false,
    });

    expect(result.status).toBe("nao_verificado");
    expect(result.calculatedBalance).toBeNull();
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
  it("infers ascending statements by period closure", () => {
    expect(
      inferBalancesFromRunningBalance([
        { amount: 300, balance: 1300 },
        { amount: -200, balance: 1100 },
        { amount: 150, balance: 1250 },
      ]),
    ).toMatchObject({ openingBalance: 1000, closingBalance: 1250 });
  });

  it("infers descending statements by period closure", () => {
    expect(
      inferBalancesFromRunningBalance([
        { amount: 150, balance: 1250 },
        { amount: -200, balance: 1100 },
        { amount: 300, balance: 1300 },
      ]),
    ).toMatchObject({ openingBalance: 1000, closingBalance: 1250 });
  });

  it("can infer a period even when intermediate balances are not sequential", () => {
    expect(
      inferBalancesFromRunningBalance([
        { amount: 300, balance: 1300 },
        { amount: -50, balance: 900 },
        { amount: -200, balance: 1050 },
        { amount: 150, balance: 1200 },
      ]),
    ).toMatchObject({ openingBalance: 1000, closingBalance: 1200 });
  });

  it("does not infer when neither orientation closes", () => {
    expect(
      inferBalancesFromRunningBalance([
        { amount: 300, balance: 1300 },
        { amount: -200, balance: 800 },
        { amount: 150, balance: 700 },
      ]),
    ).toMatchObject({ openingBalance: null, closingBalance: null });
  });
});
