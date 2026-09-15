import { describe, expect, it } from "vitest";
import { buildRulesFromRows, guessRuleMapping, resolveBehavior, resolveNature } from "./rules-file";

const clients = [{ id: "11111111-1111-1111-1111-111111111111", name: "Adan Henrique Rocha" }];
const mapping = {
  pattern: "Padrão",
  match_field: "Campo",
  account: "Conta",
  nature: "Natureza",
  behavior: "Comportamento",
  area: "Área",
  client: "Cliente",
} as const;

const row = (over: Record<string, unknown> = {}) => ({
  "Padrão": "POSTO IPIRANGA",
  Campo: "fornecedor",
  Conta: "Combustível",
  Natureza: "Custo",
  Comportamento: "Variável",
  "Área": "Logística",
  Cliente: "",
  ...over,
});

describe("rules-file", () => {
  it("sugere mapeamento por nome de coluna", () => {
    const m = guessRuleMapping(["Padrão", "Conta gerencial", "Natureza", "Cliente"]);
    expect(m.pattern).toBe("Padrão");
    expect(m.account).toBe("Conta gerencial");
    expect(m.nature).toBe("Natureza");
    expect(m.client).toBe("Cliente");
  });

  it("resolve enums por código e por rótulo", () => {
    expect(resolveNature("receita_bruta")).toBe("receita_bruta");
    expect(resolveNature("Dedução da Receita")).toBe("deducao");
    expect(resolveNature("inexistente")).toBeNull();
    expect(resolveBehavior("Variável")).toBe("variavel");
    expect(resolveBehavior("")).toBe("nao_definido");
    expect(resolveBehavior("talvez")).toBeNull();
  });

  it("valida linhas e resolve cliente", () => {
    const result = buildRulesFromRows(
      [row(), row({ Cliente: "Adan Henrique Rocha", "Padrão": "UBER" }), row({ Natureza: "xpto", "Padrão": "X" })],
      mapping,
      clients,
    );
    expect(result.rules).toHaveLength(2);
    expect(result.rules[0]!.client_id).toBeNull();
    expect(result.rules[1]!.client_id).toBe(clients[0]!.id);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.reason).toContain("Natureza inválida");
  });

  it("consolida duplicatas idênticas e bloqueia divergentes", () => {
    const identical = buildRulesFromRows([row(), row()], mapping, clients);
    expect(identical.rules).toHaveLength(1);
    expect(identical.duplicatesMerged).toBe(1);

    const divergent = buildRulesFromRows([row(), row({ Conta: "Frete" })], mapping, clients);
    expect(divergent.rules).toHaveLength(0);
    expect(divergent.errors).toHaveLength(2);
  });

  it("recusa regra global para não administrador", () => {
    const result = buildRulesFromRows([row()], mapping, clients, { canCreateGlobal: false });
    expect(result.rules).toHaveLength(0);
    expect(result.errors[0]!.reason).toContain("administrador");
  });
});
