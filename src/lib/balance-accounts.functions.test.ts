import { describe, expect, test } from "vitest";
import { toBalanceAccountSaveError } from "./balance-accounts.functions";

describe("toBalanceAccountSaveError", () => {
  test("duplicata de nome de conta por cliente retorna erro legível", () => {
    const error = toBalanceAccountSaveError(
      { code: "23505", message: 'duplicate key value violates unique constraint "balance_accounts_client_id_name_key"' },
      "Caminhão HHK",
    );

    expect(error).not.toBeNull();
    expect(error!.message).toBe('Já existe uma conta chamada "Caminhão HHK" para este cliente.');
  });

  test("outros erros do Postgres mantêm a mensagem original, sem mascarar a causa", () => {
    const error = toBalanceAccountSaveError({ code: "23503", message: "foreign key violation" }, "Conta X");

    expect(error!.message).toBe("foreign key violation");
  });

  test("ausência de erro retorna null", () => {
    expect(toBalanceAccountSaveError(null, "Conta X")).toBeNull();
  });
});
