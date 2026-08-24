import { describe, expect, it } from "vitest";
import { historyKey } from "./classify";
import { erinhoCategoryMapping, parseErinhoTrainingRows } from "./erinho-training";
import { prepareTrainingBatch } from "./training-import";

const clientId = "11111111-1111-4111-8111-111111111111";

describe("Grupo Erinho training adapter", () => {
  it("maps the Erinho financial vocabulary explicitly", () => {
    expect(erinhoCategoryMapping("CMV")).toEqual({ nature: "custo", behavior: "variavel" });
    expect(erinhoCategoryMapping("Despesa Financeira")).toEqual({
      nature: "despesa_financeira",
      behavior: "nao_aplicavel",
    });
    expect(erinhoCategoryMapping("Juros Financeiros")).toEqual({
      nature: "despesa_financeira",
      behavior: "nao_aplicavel",
    });
    expect(erinhoCategoryMapping("Outras Receitas")).toEqual({
      nature: "outra_receita",
      behavior: "nao_aplicavel",
    });
  });

  it("promotes a useful detailed description to historical identity", () => {
    const parsed = parseErinhoTrainingRows([
      {
        Categoria: "CMV",
        Descrição: "Liquidação de boleto",
        "Descrição Detalhada": "ALIANCA PRUDENT",
        "C/D": "Débito",
      },
    ]);

    expect(parsed.rejected).toHaveLength(0);
    expect(parsed.rows[0]?.counterparty).toBe("ALIANCA PRUDENT");
    expect(historyKey(parsed.rows[0]!)).toBe("SAIDA|ALIANCA PRUDENT");
  });

  it("preserves credit direction when the historical file provides C/D", () => {
    const parsed = parseErinhoTrainingRows([
      {
        Categoria: "Outras Receitas",
        Descrição: "Recebimento",
        "Descrição Detalhada": "CLIENTE TESTE",
        "C/D": "Crédito",
      },
    ]);

    expect(historyKey(parsed.rows[0]!)).toBe("ENTRADA|CLIENTE TESTE");
  });

  it("does not promote generic detailed bank text to a counterparty", () => {
    const parsed = parseErinhoTrainingRows([
      {
        Categoria: "Despesa Financeira",
        Descrição: "Tarifa de cobrança",
        "Descrição Detalhada": "Débito referente a tarifas bancárias sobre serviços de cobrança.",
        "C/D": "Débito",
      },
    ]);

    expect(parsed.rows[0]?.counterparty).toBeNull();
    expect(parsed.rows[0]?.description).toBe("Tarifa de cobrança");
  });

  it("rejects financially ambiguous categories instead of guessing", () => {
    const parsed = parseErinhoTrainingRows([
      {
        Categoria: "Imobilizado",
        Descrição: "Liquidação de boleto",
        "Descrição Detalhada": "FORNECEDOR MAQUINA",
        "C/D": "Débito",
      },
    ]);

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.rejected[0]?.reason).toBe("unknown_category:Imobilizado");
  });

  it("deduplicates repeated supplier knowledge across historical rows", () => {
    const parsed = parseErinhoTrainingRows([
      {
        Categoria: "CMV",
        Descrição: "Liquidação de boleto",
        "Descrição Detalhada": "ALIANCA PRUDENT",
        "C/D": "Débito",
      },
      {
        Categoria: "CMV",
        Descrição: "Liquidação de boleto",
        "Descrição Detalhada": "ALIANCA PRUDENT",
        "C/D": "Débito",
      },
    ]);
    const prepared = prepareTrainingBatch(clientId, parsed.rows);

    expect(prepared.ready).toHaveLength(1);
    expect(prepared.duplicatesInBatch).toHaveLength(1);
    expect(prepared.conflicts).toHaveLength(0);
  });
});
