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

function transitionScore(rows: RunningBalanceRowLike[], direction: "forward" | "reverse", tolerance: number): number {
  let matches = 0;
  let comparisons = 0;

  for (let i = 1; i < rows.length; i += 1) {
    const previous = rows[i - 1]!;
    const current = rows[i]!;
    if (!isFiniteNumber(previous.balance) || !isFiniteNumber(current.balance)) continue;
    comparisons += 1;

    const matchesTransition =
      direction === "forward"
        ? withinTolerance(previous.balance + current.amount, current.balance, tolerance)
        : withinTolerance(current.balance + previous.amount, previous.balance, tolerance);

    if (matchesTransition) matches += 1;
  }

  return comparisons === 0 ? 0 : matches / comparisons;
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

  const totalNet = roundCurrency(usable.reduce((sum, row) => sum + row.amount, 0));
  const first = usable[0]!;
  const last = usable.at(-1)!;

  const forwardOpening = roundCurrency(first.balance! - first.amount);
  const forwardClosing = roundCurrency(last.balance!);
  const forwardCloses = withinTolerance(forwardOpening + totalNet, forwardClosing, tolerance);

  const reverseOpening = roundCurrency(last.balance! - last.amount);
  const reverseClosing = roundCurrency(first.balance!);
  const reverseCloses = withinTolerance(reverseOpening + totalNet, reverseClosing, tolerance);

  if (forwardCloses && !reverseCloses) {
    return {
      openingBalance: forwardOpening,
      closingBalance: forwardClosing,
      openingSource: "coluna de saldo acumulado (fechamento do período, ordem crescente)",
      closingSource: "coluna de saldo acumulado (última linha)",
    };
  }

  if (reverseCloses && !forwardCloses) {
    return {
      openingBalance: reverseOpening,
      closingBalance: reverseClosing,
      openingSource: "coluna de saldo acumulado (fechamento do período, ordem decrescente)",
      closingSource: "coluna de saldo acumulado (primeira linha)",
    };
  }

  if (forwardCloses && reverseCloses) {
    const forwardScore = transitionScore(usable, "forward", tolerance);
    const reverseScore = transitionScore(usable, "reverse", tolerance);

    if (forwardScore > reverseScore) {
      return {
        openingBalance: forwardOpening,
        closingBalance: forwardClosing,
        openingSource: "coluna de saldo acumulado (fechamento do período, ordem crescente)",
        closingSource: "coluna de saldo acumulado (última linha)",
      };
    }

    if (reverseScore > forwardScore) {
      return {
        openingBalance: reverseOpening,
        closingBalance: reverseClosing,
        openingSource: "coluna de saldo acumulado (fechamento do período, ordem decrescente)",
        closingSource: "coluna de saldo acumulado (primeira linha)",
      };
    }
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
