import { describe, expect, it } from "vitest";
import { counterpartyFromDescription, historyKey } from "./classify";
import { bandronesCategoryMapping, parseBandronesTrainingRows } from "./bandrones-training";
import { prepareTrainingBatch } from "./training-import";

const clientId = "11111111-1111-4111-8111-111111111111";

describe("Bandrones training adapter", () => {
  it("maps the known Bandrones DRE categories explicitly", () => {
    expect(bandronesCategoryMapping("Receita Bruta")).toEqual({
      nature: "receita_bruta",
      behavior: "variavel",
    });
    expect(bandronesCategoryMapping("Despesas Fixas")).toEqual({
      nature: "despesa",
      behavior: "fixo",
    });
    expect(bandronesCategoryMapping("Custo de Mercadoria Vendida")).toEqual({
      nature: "custo",
      behavior: "variavel",
    });
    expect(bandronesCategoryMapping("Excluso DRE")).toEqual({
      nature: "excluido",
      behavior: "nao_aplicavel",
    });
  });

  it("extracts counterparties embedded in PIX descriptions", () => {
    expect(
      counterpartyFromDescription("PIX RECEBIDO REM: RPB REFLORESTAMENTOS  06/04"),
    ).toBe("RPB REFLORESTAMENTOS");
    expect(
      counterpartyFromDescription("PIX ENVIADO DES: AMERICA DRONES E TECN 11/05"),
    ).toBe("AMERICA DRONES E TECN");
    expect(
      counterpartyFromDescription("PIX QR CODE DINAMICO DES: AUTO POSTO AVIADOR LT 12/05"),
    ).toBe("AUTO POSTO AVIADOR LT");
  });

  it("uses the extracted counterparty as the historical identity", () => {
    expect(
      historyKey({
        description: "PIX QR CODE DINAMICO DES: AUTO POSTO AVIADOR LT 12/05",
        counterparty: null,
      }),
    ).toBe("AUTO POSTO AVIADOR LT");
  });

  it("converts real Bandrones-shaped rows to TrainingInputRow", () => {
    const parsed = parseBandronesTrainingRows([
      {
        Data: "12/05/2026",
        Descrição: "PIX QR CODE DINAMICO DES: AUTO POSTO AVIADOR LT 12/05",
        "Ramo Empresarial": "null",
        Valor: 250,
        Tipo: "Despesa",
        "Do que é esse gasto?": "",
        Categoria: "Despesas Variáveis",
      },
    ]);

    expect(parsed.rejected).toHaveLength(0);
    expect(parsed.rows).toEqual([
      {
        description: "PIX QR CODE DINAMICO DES: AUTO POSTO AVIADOR LT 12/05",
        counterparty: null,
        originalCategory: null,
        account: "Despesas Variáveis",
        nature: "despesa",
        behavior: "variavel",
        area: null,
        sourceRowNumber: 2,
      },
    ]);
  });

  it("preserves business context without pretending it is the counterparty", () => {
    const parsed = parseBandronesTrainingRows([
      {
        Descrição: "PIX ENVIADO DES: ELIAS VIEIRA DOS SANT 15/05",
        "Ramo Empresarial": "Marketing",
        Tipo: "Despesa",
        Categoria: "Despesas Variáveis",
      },
    ]);

    expect(parsed.rows[0]?.counterparty).toBeNull();
    expect(parsed.rows[0]?.originalCategory).toBe("Marketing");
  });

  it("rejects unknown categories instead of guessing a financial classification", () => {
    const parsed = parseBandronesTrainingRows([
      {
        Descrição: "LANCAMENTO TESTE",
        Categoria: "Categoria desconhecida",
      },
    ]);

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.rejected).toEqual([
      { sourceRowNumber: 2, reason: "unknown_category:Categoria desconhecida" },
    ]);
  });

  it("feeds the parsed rows directly into the pure training batch", () => {
    const parsed = parseBandronesTrainingRows([
      {
        Descrição: "PIX QR CODE DINAMICO DES: AUTO POSTO AVIADOR LT 12/05",
        Categoria: "Despesas Variáveis",
      },
      {
        Descrição: "PIX QR CODE DINAMICO DES: AUTO POSTO AVIADOR LT 29/05",
        Categoria: "Despesas Variáveis",
      },
    ]);
    const prepared = prepareTrainingBatch(clientId, parsed.rows);

    expect(prepared.ready).toHaveLength(1);
    expect(prepared.duplicatesInBatch).toHaveLength(1);
    expect(prepared.conflicts).toHaveLength(0);
  });
});
