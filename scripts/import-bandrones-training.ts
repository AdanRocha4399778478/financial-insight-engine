import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { parseBandronesTrainingRows } from "../src/lib/bandrones-training";
import {
  prepareTrainingBatch,
  type ExistingTrainingExample,
} from "../src/lib/training-import";

function readEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
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
  const args = process.argv.slice(2);
  const clientId = args[0];
  const xlsxPath = args[1];
  const apply = args.includes("--apply");

  if (!clientId || !xlsxPath) {
    throw new Error(
      'Uso: npx tsx scripts/import-bandrones-training.ts <client_id> "<arquivo.xlsx>" [--apply]',
    );
  }
  if (!fs.existsSync(xlsxPath)) throw new Error(`Arquivo nao encontrado: ${xlsxPath}`);

  const env = readEnvFile(".env");
  const supabaseUrl = process.env.SUPABASE_URL ?? env.SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.TEST_SUPABASE_EMAIL;
  const password = process.env.TEST_SUPABASE_PASSWORD;

  if (!supabaseUrl || !publishableKey) {
    throw new Error("SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY nao encontrados no .env.");
  }
  if (!email || !password) {
    throw new Error("Defina TEST_SUPABASE_EMAIL e TEST_SUPABASE_PASSWORD nesta sessao.");
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

  const workbook = XLSX.readFile(xlsxPath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Planilha sem abas.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Nao foi possivel abrir a primeira aba.");

  const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  });

  const parsed = parseBandronesTrainingRows(sourceRows);
  const existing = await loadExisting(supabase, clientId);
  const prepared = prepareTrainingBatch(clientId, parsed.rows, existing);

  console.log("Resumo do lote:", {
    sourceRows: sourceRows.length,
    parsedRows: parsed.rows.length,
    rejectedByParser: parsed.rejected.length,
    ready: prepared.ready.length,
    duplicatesInBatch: prepared.duplicatesInBatch.length,
    duplicatesExisting: prepared.duplicatesExisting.length,
    conflicts: prepared.conflicts.length,
    invalid: prepared.invalid.length,
    apply,
  });

  if (parsed.rejected.length) {
    console.log("Rejeitadas pelo parser:", JSON.stringify(parsed.rejected, null, 2));
  }

  if (prepared.conflicts.length) {
    console.log(
      "Conflitos nao persistidos:",
      JSON.stringify(
        prepared.conflicts.map((conflict) => ({
          historyKey: conflict.historyKey,
          reason: conflict.reason,
          sourceRows: conflict.rows.map((row) => row.sourceRowNumber),
          accounts: [...new Set(conflict.rows.map((row) => row.account))],
        })),
        null,
        2,
      ),
    );
  }

  if (!apply) {
    console.log("DRY RUN concluido. Nenhum registro foi gravado. Use --apply para persistir apenas ready.");
    await supabase.auth.signOut();
    return;
  }

  const sourceFile = path.basename(xlsxPath);
  if (prepared.ready.length) {
    const payload = prepared.ready.map((row) => ({
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

  const after = await loadExisting(supabase, clientId);
  const secondPass = prepareTrainingBatch(clientId, parsed.rows, after);

  console.log("Pos-importacao:", {
    inserted: prepared.ready.length,
    remainingReady: secondPass.ready.length,
    duplicatesExisting: secondPass.duplicatesExisting.length,
    conflicts: secondPass.conflicts.length,
    invalid: secondPass.invalid.length,
  });

  if (secondPass.ready.length !== 0) {
    throw new Error("Apos a importacao ainda existem linhas ready; interrompa e investigue antes de repetir.");
  }

  console.log("OK: carga concluida; conflitos permaneceram fora do treinamento.");
  await supabase.auth.signOut();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
