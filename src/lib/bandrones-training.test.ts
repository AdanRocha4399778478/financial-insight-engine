import { describe, expect, it } from "vitest";
import {
  counterpartyFromDescription,
  historyKey,
  movementDirectionFromDescription,
} from "./classify";
import { bandronesCategoryMapping, parseBandronesTrainingRows } from "./bandrones-training";
import { prepareTrainingBatch } from "./training-import";

const clientId = "11111111-1111-4111-8111-111111111111";

describe("Bandrones training adapter", () => {
  it("maps the known Bandrones DRE categories explicitly", () => {
    expect(bandronesCategoryMapping("Receita Bruta")).toEqual({
      nature: "receita_bruta",
      behavior: "nao_aplicavel",
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
    expect(bandronesCategoryMapping("Crédito de ajuste de contas")).toEqual({
      nature: "nao_definido",
      behavior: "nao_definido",
    });
  });

  it("extracts counterparties embedded in bank descriptions", () => {
    expect(
      counterpartyFromDescription("PIX RECEBIDO REM: RPB REFLORESTAMENTOS  06/04"),
    ).toBe("RPB REFLORESTAMENTOS");
    expect(
      counterpartyFromDescription("PIX ENVIADO DES: AMERICA DRONES E TECN 11/05"),
    ).toBe("AMERICA DRONES E TECN");
    expect(
      counterpartyFromDescription("PIX QR CODE DINAMICO DES: AUTO POSTO AVIADOR LT 12/05"),
    ).toBe("AUTO POSTO AVIADOR LT");
    expect(
      counterpartyFromDescription("PIX QR CODE ESTATICO DES: SO LUZ MATERIAIS ELET 07/07"),
    ).toBe("SO LUZ MATERIAIS ELET");
    expect(counterpartyFromDescription("COMPRA CARTAO VISA AUTO POSTO AVIADOR L")).toBe(
      "AUTO POSTO AVIADOR L",
    );
  });

  it("recognizes economic movement direction from bank descriptions", () => {
    expect(movementDirectionFromDescription("PIX RECEBIDO REM: ELIAS VIEIRA DOS SANT 06/07")).toBe(
      "entrada",
    );
    expect(movementDirectionFromDescription("PIX ENVIADO DES: ELIAS VIEIRA DOS SANT 16/07")).toBe(
      "saida",
    );
    expect(
      movementDirectionFromDescription("PIX QR CODE ESTATICO DES: SO LUZ MATERIAIS ELET 07/07"),
    ).toBe("saida");
  });

  it("uses direction plus counterparty as historical identity", () => {
    expect(
      historyKey({
        description: "PIX QR CODE DINAMICO DES: AUTO POSTO AVIADOR LT 12/05",
        counterparty: null,
      }),
    ).toBe("SAIDA|AUTO POSTO AVIADOR LT");

    expect(
      historyKey({
        description: "PIX RECEBIDO REM: ELIAS VIEIRA DOS SANT 06/07",
        counterparty: null,
      }),
    ).toBe("ENTRADA|ELIAS VIEIRA DOS SANT");
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
        counterparty: "AUTO POSTO AVIADOR LT",
        originalCategory: null,
        account: "Despesas Variáveis",
        nature: "despesa",
        behavior: "variavel",
        area: null,
        sourceRowNumber: 2,
      },
    ]);
  });

  it("preserves business context separately from the extracted counterparty", () => {
    const parsed = parseBandronesTrainingRows([
      {
        Descrição: "PIX ENVIADO DES: ELIAS VIEIRA DOS SANT 15/05",
        "Ramo Empresarial": "Marketing",
        Tipo: "Despesa",
        Categoria: "Despesas Variáveis",
      },
    ]);

    expect(parsed.rows[0]?.counterparty).toBe("ELIAS VIEIRA DOS SANT");
    expect(parsed.rows[0]?.originalCategory).toBe("Marketing");
  });

  it("does not treat incoming and outgoing movements for the same counterparty as a conflict", () => {
    const parsed = parseBandronesTrainingRows([
      {
        Descrição: "PIX RECEBIDO REM: ELIAS VIEIRA DOS SANT 06/07",
        Categoria: "Receita Bruta",
      },
      {
        Descrição: "PIX ENVIADO DES: ELIAS VIEIRA DOS SANT 16/07",
        Categoria: "Despesas Variáveis",
      },
    ]);
    const prepared = prepareTrainingBatch(clientId, parsed.rows);

    expect(prepared.conflicts).toHaveLength(0);
    expect(prepared.ready).toHaveLength(2);
    expect(prepared.ready.map((item) => item.historyKey).sort()).toEqual([
      "ENTRADA|ELIAS VIEIRA DOS SANT",
      "SAIDA|ELIAS VIEIRA DOS SANT",
    ]);
  });

  it("keeps a real same-direction classification divergence as conflict", () => {
    const parsed = parseBandronesTrainingRows([
      {
        Descrição: "PIX ENVIADO DES: GUMA COMERCIO DE ALIM 10/05",
        Categoria: "Pro Labore",
      },
      {
        Descrição: "PIX ENVIADO DES: GUMA COMERCIO DE ALIM 20/05",
        Categoria: "Outras Despesas",
      },
    ]);
    const prepared = prepareTrainingBatch(clientId, parsed.rows);

    expect(prepared.ready).toHaveLength(0);
    expect(prepared.conflicts).toHaveLength(1);
    expect(prepared.conflicts[0]?.historyKey).toBe("SAIDA|GUMA COMERCIO DE ALIM");
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
