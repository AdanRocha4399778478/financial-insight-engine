import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseBandronesTrainingRows } from "../src/lib/bandrones-training";
import {
  prepareTrainingBatch,
  type ExistingTrainingExample,
} from "../src/lib/training-import";

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(path)) return out;

  for (const rawLine of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function toExisting(row: {
  history_key: string;
  account: string;
  nature: string;
  behavior: string;
  area: string | null;
  fingerprint: string;
}): ExistingTrainingExample {
  return {
    historyKey: row.history_key,
    account: row.account,
    nature: row.nature as ExistingTrainingExample["nature"],
    behavior: row.behavior as ExistingTrainingExample["behavior"],
    area: row.area,
    fingerprint: row.fingerprint,
  };
}

async function loadExisting(supabase: ReturnType<typeof createClient>, clientId: string) {
  const { data, error } = await supabase
    .from("training_examples")
    .select("history_key, account, nature, behavior, area, fingerprint")
    .eq("client_id", clientId)
    .eq("active", true)
    .limit(50000);

  if (error) throw new Error(`Falha ao ler training_examples: ${error.message}`);
  return (data ?? []).map(toExisting);
}

async function main() {
  const clientId = process.argv[2];
  if (!clientId) throw new Error("Informe o client_id como primeiro argumento.");

  const fileEnv = readEnvFile(".env");
  const supabaseUrl = process.env.SUPABASE_URL ?? fileEnv.SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? fileEnv.SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.TEST_SUPABASE_EMAIL;
  const password = process.env.TEST_SUPABASE_PASSWORD;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY nao encontrados no .env.");
  }
  if (!email || !password) {
    throw new Error("Defina TEST_SUPABASE_EMAIL e TEST_SUPABASE_PASSWORD apenas nesta sessao.");
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError || !auth.user) {
    throw new Error(`Falha no login: ${authError?.message ?? "usuario nao retornado"}`);
  }

  const sourceFile = "__controlled_training_test__";
  const parsed = parseBandronesTrainingRows([
    {
      Descrição: "PIX RECEBIDO REM: RPB REFLORESTAMENTOS 06/04",
      Categoria: "Receita Bruta",
    },
    {
      Descrição: "PIX ENVIADO DES: AMERICA DRONES E TECN 11/05",
      Categoria: "Despesas Variáveis",
    },
    {
      Descrição: "PIX QR CODE DINAMICO DES: AUTO POSTO AVIADOR LT 12/05",
      Categoria: "Despesas Variáveis",
    },
  ]);

  if (parsed.rejected.length) {
    throw new Error(`Linhas rejeitadas no parser: ${JSON.stringify(parsed.rejected)}`);
  }

  const before = await loadExisting(supabase, clientId);
  const first = prepareTrainingBatch(clientId, parsed.rows, before);

  console.log("Primeira preparacao:", {
    ready: first.ready.length,
    duplicatesInBatch: first.duplicatesInBatch.length,
    duplicatesExisting: first.duplicatesExisting.length,
    conflicts: first.conflicts.length,
    invalid: first.invalid.length,
  });

  if (first.conflicts.length || first.invalid.length) {
    console.log(JSON.stringify({ conflicts: first.conflicts, invalid: first.invalid }, null, 2));
    throw new Error("Teste controlado interrompido por conflito/linha invalida.");
  }

  if (first.ready.length) {
    const payload = first.ready.map((row) => ({
      client_id: clientId,
      description: row.description,
      counterparty: row.counterparty,
      original_category: row.originalCategory,
      history_key: row.historyKey,
      account: row.account,
      nature: row.nature,
      behavior: row.behavior,
      area: row.area,
      source_type: "historical_import",
      source_file: sourceFile,
      source_row_number: row.sourceRowNumber,
      fingerprint: row.fingerprint,
      active: true,
      created_by: auth.user.id,
    }));

    const { error: insertError } = await supabase.from("training_examples").insert(payload);
    if (insertError) throw new Error(`Falha na insercao: ${insertError.message}`);
  }

  const { data: persisted, error: persistedError } = await supabase
    .from("training_examples")
    .select("history_key, account, nature, behavior, area, fingerprint, source_row_number")
    .eq("client_id", clientId)
    .eq("source_file", sourceFile)
    .order("source_row_number", { ascending: true });
  if (persistedError) throw new Error(`Falha na conferencia: ${persistedError.message}`);

  console.log("Persistidos no teste controlado:", persisted ?? []);

  const after = await loadExisting(supabase, clientId);
  const second = prepareTrainingBatch(clientId, parsed.rows, after);

  console.log("Segunda preparacao (idempotencia):", {
    ready: second.ready.length,
    duplicatesExisting: second.duplicatesExisting.length,
    conflicts: second.conflicts.length,
    invalid: second.invalid.length,
  });

  if (second.ready.length !== 0 || second.duplicatesExisting.length !== parsed.rows.length) {
    throw new Error("Falha de idempotencia: a segunda execucao ainda produziria novas insercoes.");
  }

  console.log("OK: persistencia, RLS e idempotencia validadas.");
  await supabase.auth.signOut();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
