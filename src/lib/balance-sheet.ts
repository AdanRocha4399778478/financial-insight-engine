export interface BalanceAccountLike {
  id: string;
  balance_group: string;
  balance_subgroup: string | null;
}

export interface BalanceTotals {
  ativoCirculante: number;
  ativoNaoCirculante: number;
  totalAtivo: number;
  passivoCirculante: number;
  passivoNaoCirculante: number;
  totalPassivo: number;
  patrimonioLiquido: number;
}

/**
 * Soma os valores lançados no mês por grupo/subgrupo. Uma conta sem entrada
 * em `valuesByAccountId` (ausência de lançamento no mês) não entra na soma —
 * não é tratada como zero, mesma regra do GATE 2a (toManualEntryValues).
 * Patrimônio Líquido não tem conta própria: é sempre Total Ativo - Total
 * Passivo, calculado aqui, não somado a partir de contas.
 */
export function computeBalanceTotals(
  accounts: BalanceAccountLike[],
  valuesByAccountId: Record<string, number>,
): BalanceTotals {
  let ativoCirculante = 0;
  let ativoNaoCirculante = 0;
  let passivoCirculante = 0;
  let passivoNaoCirculante = 0;

  for (const account of accounts) {
    const value = valuesByAccountId[account.id];
    if (value === undefined) continue;

    if (account.balance_group === "ativo") {
      if (account.balance_subgroup === "circulante") ativoCirculante += value;
      else if (account.balance_subgroup === "nao_circulante") ativoNaoCirculante += value;
    } else if (account.balance_group === "passivo") {
      if (account.balance_subgroup === "circulante") passivoCirculante += value;
      else if (account.balance_subgroup === "nao_circulante") passivoNaoCirculante += value;
    }
  }

  const totalAtivo = ativoCirculante + ativoNaoCirculante;
  const totalPassivo = passivoCirculante + passivoNaoCirculante;

  return {
    ativoCirculante,
    ativoNaoCirculante,
    totalAtivo,
    passivoCirculante,
    passivoNaoCirculante,
    totalPassivo,
    patrimonioLiquido: totalAtivo - totalPassivo,
  };
}
