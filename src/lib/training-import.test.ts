import { describe, expect, it } from "vitest";
import { prepareTrainingBatch, type ExistingTrainingExample, type TrainingInputRow } from "./training-import";

const clientId = "11111111-1111-4111-8111-111111111111";

function row(overrides: Partial<TrainingInputRow> = {}): TrainingInputRow {
  return {
    description: "PIX AUTO POSTO AVIADOR",
    counterparty: "AUTO POSTO AVIADOR",
    originalCategory: "Combustível",
    account: "Combustível",
    nature: "custo",
    behavior: "variavel",
    area: "Operação",
    sourceRowNumber: 1,
    ...overrides,
  };
}

describe("prepareTrainingBatch", () => {
  it("keeps one example and marks an exact repeated row as duplicate in batch", () => {
    const result = prepareTrainingBatch(clientId, [row(), row({ sourceRowNumber: 2 })]);

    expect(result.ready).toHaveLength(1);
    expect(result.duplicatesInBatch).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);
    expect(result.invalid).toHaveLength(0);
  });

  it("treats same knowledge from another source row as the same fingerprint", () => {
    const first = prepareTrainingBatch(clientId, [row({ sourceRowNumber: 10 })]);
    const second = prepareTrainingBatch(clientId, [row({ sourceRowNumber: 200 })]);

    expect(first.ready[0]?.fingerprint).toBe(second.ready[0]?.fingerprint);
  });

  it("detects conflicting classifications for the same history key in the batch", () => {
    const result = prepareTrainingBatch(clientId, [
      row(),
      row({
        sourceRowNumber: 2,
        account: "Manutenção",
        nature: "despesa",
        behavior: "fixo",
        area: "Administrativo",
      }),
    ]);

    expect(result.ready).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.reason).toBe("batch_classification_conflict");
  });

  it("recognizes knowledge already persisted as duplicate instead of inserting again", () => {
    const firstPass = prepareTrainingBatch(clientId, [row()]);
    const prepared = firstPass.ready[0];
    expect(prepared).toBeDefined();

    const existing: ExistingTrainingExample[] = [
      {
        historyKey: prepared!.historyKey,
        account: prepared!.account,
        nature: prepared!.nature,
        behavior: prepared!.behavior,
        area: prepared!.area,
        fingerprint: prepared!.fingerprint,
      },
    ];

    const secondPass = prepareTrainingBatch(clientId, [row()], existing);

    expect(secondPass.ready).toHaveLength(0);
    expect(secondPass.duplicatesExisting).toHaveLength(1);
    expect(secondPass.conflicts).toHaveLength(0);
  });

  it("detects conflict against an existing classification with the same history key", () => {
    const existing: ExistingTrainingExample[] = [
      {
        historyKey: "AUTO POSTO AVIADOR",
        account: "Manutenção",
        nature: "despesa",
        behavior: "fixo",
        area: "Administrativo",
      },
    ];

    const result = prepareTrainingBatch(clientId, [row()], existing);

    expect(result.ready).toHaveLength(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.reason).toBe("existing_classification_conflict");
  });

  it("rejects rows without a usable historical identity", () => {
    const result = prepareTrainingBatch(clientId, [
      row({ description: "", counterparty: null }),
    ]);

    expect(result.ready).toHaveLength(0);
    expect(result.invalid).toEqual([
      { sourceRowNumber: 1, reason: "missing_identity" },
    ]);
  });
});
