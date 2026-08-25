export type StatementType = "resultado" | "balanco";
export type BalanceGroup = "ativo" | "passivo" | "patrimonio_liquido";

export const STATEMENT_TYPES: StatementType[] = ["resultado", "balanco"];
export const BALANCE_GROUPS: BalanceGroup[] = ["ativo", "passivo", "patrimonio_liquido"];

export const STATEMENT_TYPE_LABEL: Record<StatementType, string> = {
  resultado: "Resultado (DRE)",
  balanco: "Balanço Patrimonial",
};

export const BALANCE_GROUP_LABEL: Record<BalanceGroup, string> = {
  ativo: "Ativo",
  passivo: "Passivo",
  patrimonio_liquido: "Patrimônio Líquido",
};

export function normalizedStatement(
  statementType: StatementType | null | undefined,
  balanceGroup: BalanceGroup | null | undefined,
) {
  const statement_type: StatementType = statementType === "balanco" ? "balanco" : "resultado";
  return {
    statement_type,
    balance_group: statement_type === "balanco" ? (balanceGroup ?? null) : null,
  };
}
