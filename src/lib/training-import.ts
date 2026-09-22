import { fingerprint, historyKey, normalize } from "./classify";
import type { Behavior, Nature } from "./finance";

export interface TrainingSourceDiagnostics {
  rawDescription?: string | null;
  rawDetailedDescription?: string | null;
  rawDirection?: string | null;
}

export interface TrainingInputRow {
  description: string;
  counterparty: string | null;
  originalCategory: string | null;
  account: string;
  nature: Nature;
  behavior: Behavior;
  area: string | null;
  sourceRowNumber: number;
  diagnostics?: TrainingSourceDiagnostics;
}

export interface ExistingTrainingExample {
  historyKey: string;
  account: string;
  nature: Nature;
  behavior: Behavior;
  area: string | null;
  fingerprint?: string | null;
}

export interface PreparedTrainingExample extends TrainingInputRow {
  historyKey: string;
  fingerprint: string;
}

export interface TrainingConflict {
  historyKey: string;
  reason: "batch_classification_conflict" | "existing_classification_conflict";
  rows: PreparedTrainingExample[];
  existing?: ExistingTrainingExample[];
}

export interface InvalidTrainingRow {
  sourceRowNumber: number;
  reason: "invalid_source_row_number" | "missing_identity" | "missing_account";
}

export interface PrepareTrainingBatchResult {
  ready: PreparedTrainingExample[];
  duplicatesInBatch: PreparedTrainingExample[];
  duplicatesExisting: PreparedTrainingExample[];
  conflicts: TrainingConflict[];
  invalid: InvalidTrainingRow[];
}

function normalizedNullable(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed || null;
}

function classificationSignature(example: {
  account: string;
  nature: Nature;
  behavior: Behavior;
  area: string | null;
}): string {
  return [
    normalize(example.account),
    example.nature,
    example.behavior,
    normalize(example.area),
  ].join("|");
}

export function buildTrainingFingerprint(
  clientId: string,
  example: {
    historyKey: string;
    account: string;
    nature: Nature;
    behavior: Behavior;
    area: string | null;
  },
): string {
  return fingerprint([
    clientId,
    example.historyKey,
    example.account,
    example.nature,
    example.behavior,
    example.area,
  ]);
}

function prepareRow(clientId: string, row: TrainingInputRow): PreparedTrainingExample | InvalidTrainingRow {
  if (!Number.isInteger(row.sourceRowNumber) || row.sourceRowNumber <= 0) {
    return { sourceRowNumber: row.sourceRowNumber, reason: "invalid_source_row_number" };
  }

  const description = row.description.trim();
  const counterparty = normalizedNullable(row.counterparty);
  const originalCategory = normalizedNullable(row.originalCategory);
  const account = row.account.trim();
  const area = normalizedNullable(row.area);
  const key = historyKey({ description, counterparty });

  if (!key) {
    return { sourceRowNumber: row.sourceRowNumber, reason: "missing_identity" };
  }
  if (!account) {
    return { sourceRowNumber: row.sourceRowNumber, reason: "missing_account" };
  }

  const preparedBase = {
    ...row,
    description,
    counterparty,
    originalCategory,
    account,
    area,
    historyKey: key,
  };

  return {
    ...preparedBase,
    fingerprint: buildTrainingFingerprint(clientId, preparedBase),
  };
}

function isInvalid(
  value: PreparedTrainingExample | InvalidTrainingRow,
): value is InvalidTrainingRow {
  return "reason" in value;
}

/**
 * Prepara um lote de treinamento historico sem tocar no banco.
 *
 * Regras centrais:
 * - mesma identidade + mesma classificacao => duplicidade;
 * - mesma identidade + classificacao divergente => conflito;
 * - o fingerprint representa conhecimento, nao a linha financeira original;
 * - arquivo, data e valor nao participam da identidade do conhecimento.
 */
export function prepareTrainingBatch(
  clientId: string,
  rows: TrainingInputRow[],
  existing: ExistingTrainingExample[] = [],
): PrepareTrainingBatchResult {
  const result: PrepareTrainingBatchResult = {
    ready: [],
    duplicatesInBatch: [],
    duplicatesExisting: [],
    conflicts: [],
    invalid: [],
  };

  const prepared: PreparedTrainingExample[] = [];
  for (const row of rows) {
    const item = prepareRow(clientId, row);
    if (isInvalid(item)) result.invalid.push(item);
    else prepared.push(item);
  }

  const byHistory = new Map<string, PreparedTrainingExample[]>();
  for (const item of prepared) {
    const list = byHistory.get(item.historyKey) ?? [];
    list.push(item);
    byHistory.set(item.historyKey, list);
  }

  const batchConflictKeys = new Set<string>();
  for (const [key, items] of byHistory) {
    const signatures = new Set(items.map(classificationSignature));
    if (signatures.size > 1) {
      batchConflictKeys.add(key);
      result.conflicts.push({
        historyKey: key,
        reason: "batch_classification_conflict",
        rows: items,
      });
    }
  }

  const uniqueBatch: PreparedTrainingExample[] = [];
  const seenFingerprints = new Set<string>();
  for (const item of prepared) {
    if (batchConflictKeys.has(item.historyKey)) continue;
    if (seenFingerprints.has(item.fingerprint)) {
      result.duplicatesInBatch.push(item);
      continue;
    }
    seenFingerprints.add(item.fingerprint);
    uniqueBatch.push(item);
  }

  const existingByHistory = new Map<string, ExistingTrainingExample[]>();
  const existingFingerprints = new Set<string>();
  for (const item of existing) {
    const key = item.historyKey.trim();
    if (!key) continue;
    const list = existingByHistory.get(key) ?? [];
    list.push(item);
    existingByHistory.set(key, list);
    existingFingerprints.add(
      item.fingerprint ?? buildTrainingFingerprint(clientId, { ...item, historyKey: key }),
    );
  }

  for (const item of uniqueBatch) {
    if (existingFingerprints.has(item.fingerprint)) {
      result.duplicatesExisting.push(item);
      continue;
    }

    const sameKeyExisting = existingByHistory.get(item.historyKey) ?? [];
    if (sameKeyExisting.length === 0) {
      result.ready.push(item);
      continue;
    }

    const signature = classificationSignature(item);
    const existingSignatures = new Set(sameKeyExisting.map(classificationSignature));

    if (existingSignatures.size === 1 && existingSignatures.has(signature)) {
      result.duplicatesExisting.push(item);
      continue;
    }

    result.conflicts.push({
      historyKey: item.historyKey,
      reason: "existing_classification_conflict",
      rows: [item],
      existing: sameKeyExisting,
    });
  }

  return result;
}
