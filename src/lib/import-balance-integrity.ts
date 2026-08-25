import { normalize } from "./classify";

export type ImportBalanceIntegrityStatus = "conciliado" | "divergente" | "nao_verificado";

export interface ImportBalanceIntegrityInput {
  openingBalance: number | null;
  closingBalance: number | null;
  creditTotal: number;
  debitTotal: number;
  tolerance?: number;
}

export interface ImportBalanceIntegrityResult {
  status: ImportBalanceIntegrityStatus;
  calculatedBalance: number | null;
  difference: number | null;
  absoluteDifference: number | null;
  tolerance: number;
}

export interface BalanceRowLike {
  description: string;
  value: number;
}

export interface RunningBalanceRowLike {
  amount: number;
  balance: number | null;
}

export interface InferredStatementBalances {
  openingBalance: number | null;
  closingBalance: number | null;
  openingSource: string | null;
  closingSource: string | null;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function withinTolerance(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(roundCurrency(a - b)) <= tolerance;
}

function isOpeningBalanceDescription(description: string): boolean {
  const value = normalize(description);
  return /\bSALDO (ANTERIOR|INICIAL)\b/.test(value);
}

function isExplicitClosingBalanceDescription(description: string): boolean {
  const value = normalize(description);
  return /\bSALDO (FINAL|ATUAL|DISPONIVEL)\b/.test(value);
}

function isDailyBalanceDescription(description: string): boolean {
  return /\bSALDO DO DIA\b/.test(normalize(description));
}

export function inferStatementBalances(balanceRows: BalanceRowLike[]): InferredStatementBalances {
  const validRows = balanceRows.filter((row) => Number.isFinite(row.value));
  const openingRow = validRows.find((row) => isOpeningBalanceDescription(row.description)) ?? null;
  const explicitClosingRows = validRows.filter((row) => isExplicitClosingBalanceDescription(row.description));
  const explicitClosingRow = explicitClosingRows.at(-1) ?? null;

  let closingRow = explicitClosingRow;
  if (!closingRow && openingRow) {
    const dailyRows = validRows.filter((row) => isDailyBalanceDescription(row.description));
    closingRow = dailyRows.at(-1) ?? null;
  }

  return {
    openingBalance: openingRow ? roundCurrency(openingRow.value) : null,
    closingBalance: closingRow ? roundCurrency(closingRow.value) : null,
    openingSource: openingRow?.description ?? null,
    closingSource: closingRow?.description ?? null,
  };
}

export function inferBalancesFromRunningBalance(
  rows: RunningBalanceRowLike[],
  tolerance = 0.01,
): InferredStatementBalances {
  const usable = rows.filter((row) => isFiniteNumber(row.balance));
  if (usable.length < 2) {
    return {
      openingBalance: null,
      closingBalance: null,
      openingSource: null,
      closingSource: null,
    };
  }

  let forwardMatches = 0;
  let reverseMatches = 0;
  let comparisons = 0;

  for (let i = 1; i < usable.length; i += 1) {
    const previous = usable[i - 1]!;
    const current = usable[i]!;
    if (!isFiniteNumber(previous.balance) || !isFiniteNumber(current.balance)) continue;
    comparisons += 1;

    if (withinTolerance(previous.balance + current.amount, current.balance, tolerance)) {
      forwardMatches += 1;
    }
    if (withinTolerance(current.balance + previous.amount, previous.balance, tolerance)) {
      reverseMatches += 1;
    }
  }

  if (comparisons === 0) {
    return {
      openingBalance: null,
      closingBalance: null,
      openingSource: null,
      closingSource: null,
    };
  }

  const forwardRatio = forwardMatches / comparisons;
  const reverseRatio = reverseMatches / comparisons;
  const minimumConfidence = 0.8;

  if (forwardRatio >= minimumConfidence && forwardRatio > reverseRatio) {
    const first = usable[0]!;
    const last = usable.at(-1)!;
    return {
      openingBalance: roundCurrency(first.balance! - first.amount),
      closingBalance: roundCurrency(last.balance!),
      openingSource: "coluna de saldo acumulado (ordem crescente)",
      closingSource: "coluna de saldo acumulado (última linha)",
    };
  }

  if (reverseRatio >= minimumConfidence && reverseRatio > forwardRatio) {
    const first = usable[0]!;
    const last = usable.at(-1)!;
    return {
      openingBalance: roundCurrency(last.balance! - last.amount),
      closingBalance: roundCurrency(first.balance!),
      openingSource: "coluna de saldo acumulado (ordem decrescente)",
      closingSource: "coluna de saldo acumulado (primeira linha)",
    };
  }

  return {
    openingBalance: null,
    closingBalance: null,
    openingSource: null,
    closingSource: null,
  };
}

export function calculateImportBalanceIntegrity(
  input: ImportBalanceIntegrityInput,
): ImportBalanceIntegrityResult {
  const tolerance = Math.max(0, roundCurrency(input.tolerance ?? 0.01));

  if (!isFiniteNumber(input.openingBalance) || !isFiniteNumber(input.closingBalance)) {
    return {
      status: "nao_verificado",
      calculatedBalance: null,
      difference: null,
      absoluteDifference: null,
      tolerance,
    };
  }

  const calculatedBalance = roundCurrency(
    input.openingBalance + input.creditTotal - input.debitTotal,
  );
  const difference = roundCurrency(input.closingBalance - calculatedBalance);
  const absoluteDifference = Math.abs(difference);

  return {
    status: absoluteDifference <= tolerance ? "conciliado" : "divergente",
    calculatedBalance,
    difference,
    absoluteDifference,
    tolerance,
  };
}
