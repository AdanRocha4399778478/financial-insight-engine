import { describe, expect, test } from "vitest";
import { buildDre, getDreImpact, type DreRow } from "./finance";

const row = (overrides: Partial<DreRow>): DreRow => ({
  nature: "despesa",
  behavior: "variavel",
  amount: 0,
  account: "Conta Teste",
  ...overrides,
});

describe("getDreImpact — matriz de 18 casos (GATE contrato financeiro de sinais)", () => {
  // 1. receita normal
  test("1. receita normal: amount=+1000, receita_bruta -> impacto +1000", () => {
    expect(getDreImpact(1000, "receita_bruta")).toBe(1000);
  });

  // 2. estorno de receita
  test("2. estorno de receita: amount=-100, receita_bruta -> impacto -100 (reduz, não aumenta)", () => {
    expect(getDreImpact(-100, "receita_bruta")).toBe(-100);
  });

  // 3. despesa normal
  test("3. despesa normal: amount=-500, despesa -> impacto +500", () => {
    expect(getDreImpact(-500, "despesa")).toBe(500);
  });

  // 4. reembolso de despesa
  test("4. reembolso de despesa: amount=+50, despesa -> impacto -50 (reduz, não aumenta)", () => {
    expect(getDreImpact(50, "despesa")).toBe(-50);
  });

  // 5. juros pagos (Caso A do relatório)
  test("5. juros pagos: amount=-100, despesa_financeira -> impacto +100", () => {
    expect(getDreImpact(-100, "despesa_financeira")).toBe(100);
  });

  // 6. devolução de juros (Caso B do relatório — o bug original do Grupo Erinho)
  test("6. devolução de juros: amount=+20, despesa_financeira -> impacto -20 (reduz, não aumenta)", () => {
    expect(getDreImpact(20, "despesa_financeira")).toBe(-20);
  });

  // 7. receita financeira
  test("7. receita financeira: amount=+100, receita_financeira -> impacto +100", () => {
    expect(getDreImpact(100, "receita_financeira")).toBe(100);
  });

  // 8. estorno de receita financeira
  test("8. estorno de receita financeira: amount=-20, receita_financeira -> impacto -20", () => {
    expect(getDreImpact(-20, "receita_financeira")).toBe(-20);
  });

  // 9. outra receita
  test("9. outra receita: amount=+300, outra_receita -> impacto +300", () => {
    expect(getDreImpact(300, "outra_receita")).toBe(300);
  });

  // 10. outra despesa
  test("10. outra despesa: amount=-300, outra_despesa -> impacto +300", () => {
    expect(getDreImpact(-300, "outra_despesa")).toBe(300);
  });

  // 11. dedução
  test("11. dedução: amount=-50, deducao -> impacto +50", () => {
    expect(getDreImpact(-50, "deducao")).toBe(50);
  });

  // 12. zero
  test("12. zero: amount=0, qualquer nature -> impacto 0", () => {
    expect(getDreImpact(0, "despesa")).toBe(0);
    expect(getDreImpact(0, "receita_bruta")).toBe(0);
    expect(getDreImpact(0, "despesa_financeira")).toBe(0);
  });

  // 13. decimal
  test("13. decimal: amount=-33.33, despesa -> impacto 33.33 sem erro de arredondamento", () => {
    expect(getDreImpact(-33.33, "despesa")).toBeCloseTo(33.33, 2);
  });

  // 14. dre_fact positivo — buildDre é agnóstico de origem (entries vs dre_facts chegam
  // como o mesmo DreRow); comportamento hoje mantido para o caso normal (positivo em
  // nature despesa-like é tratado como eventual reversão pela fórmula, não como
  // "magnitude sempre positiva" — essa é exatamente a lacuna registrada no GATE 7/10:
  // dre_facts não foi normalizado nesta implementação, fica como está por decisão
  // explícita, então um dre_fact positivo em nature despesa-like passa a ter impacto
  // negativo aqui, diferente do abs() antigo).
  test("14. dre_fact-like positivo em nature despesa-like: mesma fórmula de entries (sem normalização por fonte)", () => {
    expect(getDreImpact(500, "despesa")).toBe(-500);
  });

  // 15. dre_fact negativo — mesma observação do caso 14, documentando que buildDre não
  // distingue a origem do dado.
  test("15. dre_fact-like negativo em nature despesa-like: mesma fórmula de entries", () => {
    expect(getDreImpact(-500, "despesa")).toBe(500);
  });

  // 16. entry + dre_fact no mesmo período — buildDre soma corretamente linhas de
  // origens distintas desde que cheguem no mesmo formato DreRow.
  test("16. entry + dre_fact no mesmo período: soma agregada correta, sem dupla contagem", () => {
    const result = buildDre([
      row({ nature: "despesa", behavior: "variavel", amount: -500, account: "Aluguel" }),
      row({ nature: "despesa", behavior: "variavel", amount: -300, account: "Aluguel" }),
    ]);
    expect(result.despesasVariaveis).toBe(800);
    expect(result.byAccount["despesa::Aluguel"]?.total).toBe(800);
    expect(result.byAccount["despesa::Aluguel"]?.count).toBe(2);
  });

  // 17. futura allocation negativa (principal/interest pagos) — valida que a fórmula já
  // funciona para o caso de decomposição futura de entry_allocations, sem precisar de
  // lógica nova: cada allocation é só mais um DreRow com sua própria nature.
  test("17. futura allocation negativa: interest=-1200 (despesa_financeira) soma como despesa financeira normal", () => {
    expect(getDreImpact(-1200, "despesa_financeira")).toBe(1200);
  });

  // 18. futura allocation positiva (estorno/reversão de uma allocation) — reduz o bucket
  // líquido automaticamente, mesma mecânica do caso 6.
  test("18. futura allocation positiva: interest=+200 (estorno) reduz despesa financeira líquida", () => {
    expect(getDreImpact(200, "despesa_financeira")).toBe(-200);
  });
});

describe("buildDre — regressão do caso normal (não deve mudar com a nova fórmula)", () => {
  test("receita bruta, custo e despesa normais produzem EBITDA idêntico ao comportamento anterior (Math.abs)", () => {
    const result = buildDre([
      row({ nature: "receita_bruta", amount: 10000, account: "Vendas" }),
      row({ nature: "custo", behavior: "variavel", amount: -4000, account: "CMV" }),
      row({ nature: "despesa", behavior: "fixo", amount: -1500, account: "Aluguel" }),
    ]);
    expect(result.receitaBruta).toBe(10000);
    expect(result.custosVariaveis).toBe(4000);
    expect(result.despesasFixas).toBe(1500);
    expect(result.margemBruta).toBe(6000);
    expect(result.ebitda).toBe(4500);
  });

  test("devolução de juros reduz despesa financeira líquida (fecha o gap do Grupo Erinho)", () => {
    const result = buildDre([
      row({ nature: "despesa_financeira", behavior: "variavel", amount: -100, account: "Juros" }),
      row({ nature: "despesa_financeira", behavior: "variavel", amount: 20, account: "Juros" }),
    ]);
    expect(result.despesasFinanceiras).toBe(80);
  });
});
