import { describe, expect, test } from "vitest";
import { computeBalanceTotals, type BalanceAccountLike } from "./balance-sheet";

const accounts: BalanceAccountLike[] = [
  { id: "caixa", balance_group: "ativo", balance_subgroup: "circulante" },
  { id: "imobilizado", balance_group: "ativo", balance_subgroup: "nao_circulante" },
  { id: "fornecedores", balance_group: "passivo", balance_subgroup: "circulante" },
  { id: "financiamento", balance_group: "passivo", balance_subgroup: "nao_circulante" },
];

describe("computeBalanceTotals", () => {
  test("soma corretamente por grupo/subgrupo e calcula PL = Total Ativo - Total Passivo", () => {
    const totals = computeBalanceTotals(accounts, {
      caixa: 10000,
      imobilizado: 50000,
      fornecedores: 8000,
      financiamento: 20000,
    });

    expect(totals.ativoCirculante).toBe(10000);
    expect(totals.ativoNaoCirculante).toBe(50000);
    expect(totals.totalAtivo).toBe(60000);
    expect(totals.passivoCirculante).toBe(8000);
    expect(totals.passivoNaoCirculante).toBe(20000);
    expect(totals.totalPassivo).toBe(28000);
    expect(totals.patrimonioLiquido).toBe(32000);
  });

  test("conta sem lançamento no mês não entra na soma (ausência != zero)", () => {
    const totals = computeBalanceTotals(accounts, {
      caixa: 10000,
      // imobilizado, fornecedores, financiamento sem lançamento neste mês
    });

    expect(totals.totalAtivo).toBe(10000);
    expect(totals.totalPassivo).toBe(0);
    expect(totals.patrimonioLiquido).toBe(10000);
  });

  test("um valor real zero é somado normalmente, diferente de ausência", () => {
    const totals = computeBalanceTotals(accounts, {
      caixa: 0,
      imobilizado: 50000,
    });

    expect(totals.ativoCirculante).toBe(0);
    expect(totals.totalAtivo).toBe(50000);
  });

  test("PL negativo quando passivo excede ativo", () => {
    const totals = computeBalanceTotals(accounts, {
      caixa: 1000,
      fornecedores: 5000,
    });

    expect(totals.patrimonioLiquido).toBe(-4000);
  });

  test("nenhum valor lançado: todos os totais zerados, sem erro", () => {
    const totals = computeBalanceTotals(accounts, {});
    expect(totals).toEqual({
      ativoCirculante: 0,
      ativoNaoCirculante: 0,
      totalAtivo: 0,
      passivoCirculante: 0,
      passivoNaoCirculante: 0,
      totalPassivo: 0,
      patrimonioLiquido: 0,
    });
  });

  test("conta de patrimonio_liquido (se existir por dado legado) é ignorada na soma", () => {
    const withPl: BalanceAccountLike[] = [
      ...accounts,
      { id: "capital-social", balance_group: "patrimonio_liquido", balance_subgroup: null },
    ];
    const totals = computeBalanceTotals(withPl, { "capital-social": 999999, caixa: 100 });
    expect(totals.totalAtivo).toBe(100);
    expect(totals.totalPassivo).toBe(0);
  });
});
