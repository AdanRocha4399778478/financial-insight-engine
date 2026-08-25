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

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
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
