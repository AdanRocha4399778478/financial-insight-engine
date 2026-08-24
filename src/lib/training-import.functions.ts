import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { BEHAVIORS, NATURES } from "./finance";
import {
  prepareTrainingBatch,
  type ExistingTrainingExample,
  type TrainingInputRow,
} from "./training-import";

const natureEnum = z.enum(NATURES as [string, ...string[]]);
const behaviorEnum = z.enum(BEHAVIORS as [string, ...string[]]);

const trainingRowSchema = z.object({
  description: z.string().max(500),
  counterparty: z.string().max(240).nullable(),
  originalCategory: z.string().max(240).nullable(),
  account: z.string().trim().min(1).max(120),
  nature: natureEnum,
  behavior: behaviorEnum,
  area: z.string().max(80).nullable(),
  sourceRowNumber: z.number().int().positive(),
});

function toExistingTrainingExample(row: {
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

/**
 * Persistencia controlada do treinamento historico.
 *
 * O servidor sempre recalcula history_key e fingerprint a partir das linhas
 * recebidas. O cliente nao consegue enviar essas identidades prontas.
 * Conflitos e duplicidades sao filtrados antes da escrita.
 */
export const importTrainingExamples = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        sourceFile: z.string().trim().min(1).max(255),
        rows: z.array(trainingRowSchema).min(1).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: existingRows, error: existingError } = await supabase
      .from("training_examples")
      .select("history_key, account, nature, behavior, area, fingerprint")
      .eq("client_id", data.clientId)
      .eq("active", true)
      .limit(50000);

    if (existingError) throw new Error(existingError.message);

    const existing = (existingRows ?? []).map(toExistingTrainingExample);
    const prepared = prepareTrainingBatch(
      data.clientId,
      data.rows as TrainingInputRow[],
      existing,
    );

    const payload = prepared.ready.map((row) => ({
      client_id: data.clientId,
      description: row.description,
      counterparty: row.counterparty,
      original_category: row.originalCategory,
      history_key: row.historyKey,
      account: row.account,
      nature: row.nature as never,
      behavior: row.behavior as never,
      area: row.area,
      source_type: "historical_import",
      source_file: data.sourceFile,
      source_row_number: row.sourceRowNumber,
      fingerprint: row.fingerprint,
      active: true,
      created_by: context.userId,
    }));

    if (payload.length > 0) {
      const { error: insertError } = await supabase
        .from("training_examples")
        .insert(payload);
      if (insertError) throw new Error(insertError.message);
    }

    return {
      received: data.rows.length,
      inserted: payload.length,
      duplicatesInBatch: prepared.duplicatesInBatch.length,
      duplicatesExisting: prepared.duplicatesExisting.length,
      invalid: prepared.invalid,
      conflicts: prepared.conflicts.map((conflict) => ({
        historyKey: conflict.historyKey,
        reason: conflict.reason,
        sourceRows: conflict.rows.map((row) => row.sourceRowNumber),
        classifications: conflict.rows.map((row) => ({
          account: row.account,
          nature: row.nature,
          behavior: row.behavior,
          area: row.area,
        })),
        existing: (conflict.existing ?? []).map((row) => ({
          account: row.account,
          nature: row.nature,
          behavior: row.behavior,
          area: row.area,
        })),
      })),
    };
  });
