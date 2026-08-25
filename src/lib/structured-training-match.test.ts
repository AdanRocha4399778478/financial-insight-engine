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
      { ...entry, description: "LIQUIDACAO BOLETO METALPARTS LTDA 23790" },
      [history("SAIDA|LIQUIDACAO BOLETO METALPARTS LTDA 99999")],
      "SAIDA|LIQUIDACAO BOLETO METALPARTS LTDA 23790",
    );

    expect(result?.history.account).toBe("CMV");
    expect(result?.confidence).toBe(0.72);
  });

  it("uses negative amount as direction fallback when the pending key has no direction", () => {
    const result = findStructuredTrainingMatch(
      { ...entry, description: "LIQUIDACAO BOLETO METALPARTS LTDA 23790", amount: -100 },
      [history("SAIDA|LIQUIDACAO BOLETO METALPARTS LTDA 99999")],
      "LIQUIDACAO BOLETO METALPARTS LTDA 23790",
    );

    expect(result?.history.account).toBe("CMV");
  });

  it("uses positive amount as direction fallback for incoming PIX", () => {
    const result = findStructuredTrainingMatch(
      {
        description: "RECEBIMENTO PIX MARIA DE FATIMA 445566",
        counterparty: null,
        original_category: null,
        amount: 500,
      },
      [history("ENTRADA|RECEBIMENTO PIX MARIA DE FATIMA 998877", "Receita")],
      "RECEBIMENTO PIX MARIA DE FATIMA 445566",
    );

    expect(result?.history.account).toBe("Receita");
  });

  it("rejects a direction mismatch even when amount fallback is available", () => {
    const result = findStructuredTrainingMatch(
      { ...entry, description: "LIQUIDACAO BOLETO METALPARTS LTDA", amount: -100 },
      [history("ENTRADA|LIQUIDACAO BOLETO METALPARTS LTDA 99999")],
      "LIQUIDACAO BOLETO METALPARTS LTDA",
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

  it("rejects ambiguous near-best candidates with different classifications", () => {
    const result = findStructuredTrainingMatch(
      { ...entry, description: "LIQUIDACAO BOLETO METAL PARTS LTDA" },
      [
        history("SAIDA|LIQUIDACAO BOLETO METAL PARTS LTDA", "CMV"),
        history("SAIDA|LIQUIDACAO BOLETO METAL PARTS COMERCIO", "Despesas Fixas"),
      ],
      "SAIDA|LIQUIDACAO BOLETO METAL PARTS LTDA FILIAL",
    );

    expect(result).toBeNull();
  });
});
