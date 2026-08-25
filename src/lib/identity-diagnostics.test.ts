import { describe, expect, it } from "vitest";
import { canonicalIdentityForEntry, findBestIdentityGapDiagnostic, operationFromText } from "./identity-diagnostics";
import type { HistoryLike } from "./classify";

const history = (key: string, account = "CMV"): HistoryLike => ({
  key,
  account,
  nature: "custo",
  behavior: "variavel",
  area: null,
});

describe("canonical identity diagnostics", () => {
  it("uses amount direction only in diagnostics when text has no direction", () => {
    const identity = canonicalIdentityForEntry({
      description: "LIQUIDACAO BOLETO 123456 SCHERER SA COMERCIO",
      counterparty: null,
      original_category: null,
      amount: -817.12,
    });

    expect(identity.textDirection).toBeNull();
    expect(identity.amountDirection).toBe("SAIDA");
    expect(identity.resolvedDirection).toBe("SAIDA");
  });

  it("recognizes economically distinct financing principal and financial charge", () => {
    expect(operationFromText("LIBERACAO CREDITO")).toBe("financing_principal");
    expect(operationFromText("TARIFA LIBERACAO CREDITO")).toBe("financial_charge");
  });

  it("explains a boleto near-match without changing productive historyKey", () => {
    const result = findBestIdentityGapDiagnostic(
      {
        description: "LIQUIDACAO BOLETO 998877 SCHERER SA COMERCIO",
        counterparty: null,
        original_category: null,
        amount: -817.12,
      },
      [history("SAIDA|LIQUIDACAO BOLETO 112233 SCHERER SA COMERCIO")],
    );

    expect(result).not.toBeNull();
    expect(result?.pendingDirection).toBe("SAIDA");
    expect(result?.candidateDirection).toBe("SAIDA");
    expect(result?.reasons).toContain("direction_only_from_amount");
    expect(result?.reasons).toContain("identity_near");
  });

  it("penalizes operation mismatch between financing principal and charge", () => {
    const result = findBestIdentityGapDiagnostic(
      {
        description: "LIBERACAO CREDITO",
        counterparty: null,
        original_category: null,
        amount: 50000,
      },
      [history("ENTRADA|TARIFA LIBERACAO CREDITO", "Despesa Financeira")],
    );

    expect(result?.reasons).toContain("operation_mismatch");
    expect(result?.score).toBeLessThan(50);
  });
});
