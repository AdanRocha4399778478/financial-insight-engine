import { describe, expect, it } from "vitest";
import type { HistoryLike, RawEntry } from "./classify";
import { findStructuredTrainingMatch } from "./structured-training-match";

const entry: RawEntry = {
  description: "LIQUIDACAO BOLETO 23790 12345 67890",
  counterparty: null,
  original_category: null,
  amount: -100,
};

const history = (key: string, account = "CMV"): HistoryLike => ({
  key,
  account,
  nature: "custo",
  behavior: "variavel",
  area: null,
});

describe("structured training matcher", () => {
  it("suggests same-direction boleto identities after removing document numbers", () => {
    const result = findStructuredTrainingMatch(
      entry,
      [history("SAIDA|LIQUIDACAO BOLETO 99999 88888")],
      "SAIDA|LIQUIDACAO BOLETO 23790 12345",
    );

    expect(result?.history.account).toBe("CMV");
    expect(result?.confidence).toBe(0.72);
  });

  it("rejects a direction mismatch", () => {
    const result = findStructuredTrainingMatch(
      entry,
      [history("ENTRADA|LIQUIDACAO BOLETO 99999")],
      "SAIDA|LIQUIDACAO BOLETO 23790",
    );

    expect(result).toBeNull();
  });

  it("rejects financing principal versus financial charge", () => {
    const result = findStructuredTrainingMatch(
      { ...entry, description: "LIBERACAO CREDITO" },
      [history("SAIDA|TARIFA LIBERACAO CREDITO", "Despesa Financeira")],
      "SAIDA|LIBERACAO CREDITO",
    );

    expect(result).toBeNull();
  });

  it("does not use neutral generic identities as second-level matches", () => {
    const result = findStructuredTrainingMatch(
      { ...entry, description: "FORNECEDOR ABC 123456" },
      [history("SAIDA|FORNECEDOR ABC 999999")],
      "SAIDA|FORNECEDOR ABC 123456",
    );

    expect(result).toBeNull();
  });

  it("rejects ambiguous equal-score candidates with different classifications", () => {
    const result = findStructuredTrainingMatch(
      entry,
      [
        history("SAIDA|LIQUIDACAO BOLETO 11111", "CMV"),
        history("SAIDA|LIQUIDACAO BOLETO 22222", "Despesas Fixas"),
      ],
      "SAIDA|LIQUIDACAO BOLETO 33333",
    );

    expect(result).toBeNull();
  });
});
