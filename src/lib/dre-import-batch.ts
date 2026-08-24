import { fingerprint, normalize } from "./classify";
import type { DreFactRow } from "./dre-file";

export interface PreparedDreFact extends DreFactRow {
  client_id: string;
  fingerprint: string;
}

export interface DreBatchConflict {
  client_id: string;
  fingerprint: string;
  account_code: string;
  account_name: string;
  period: string;
  period_label: string;
  values: { amount: number; source_row?: number | undefined }[];
}

export interface PreparedDreBatch {
  facts: PreparedDreFact[];
  duplicatesRemoved: number;
  conflicts: DreBatchConflict[];
}

function semanticKey(fact: DreFactRow): string {
  return `${normalize(fact.account_code)}\u0000${normalize(fact.account_name)}\u0000${fact.period}`;
}

/**
 * Monta o lote usando a mesma chave final da constraint UNIQUE (client_id, fingerprint).
 * Duplicatas semanticamente idênticas são reduzidas a uma; colisões com valores
 * divergentes são reportadas e nunca seguem para o upsert.
 */
export function prepareDreFactBatch(clientId: string, facts: DreFactRow[]): PreparedDreBatch {
  const groups = new Map<string, PreparedDreFact[]>();
  const order: string[] = [];

  for (const fact of facts) {
    const finalFingerprint = fingerprint([clientId, fact.account_code, fact.period]);
    const prepared = { ...fact, client_id: clientId, fingerprint: finalFingerprint };
    const databaseKey = `${clientId}\u0000${finalFingerprint}`;
    const bucket = groups.get(databaseKey);
    if (bucket) bucket.push(prepared);
    else {
      groups.set(databaseKey, [prepared]);
      order.push(databaseKey);
    }
  }

  const preparedFacts: PreparedDreFact[] = [];
  const conflicts: DreBatchConflict[] = [];
  let duplicatesRemoved = 0;

  for (const databaseKey of order) {
    const bucket = groups.get(databaseKey)!;
    const first = bucket[0]!;
    const sameSemanticFact = bucket.every(
      (fact) => semanticKey(fact) === semanticKey(first) && fact.amount === first.amount,
    );

    if (sameSemanticFact) {
      preparedFacts.push(first);
      duplicatesRemoved += bucket.length - 1;
      continue;
    }

    conflicts.push({
      client_id: clientId,
      fingerprint: first.fingerprint,
      account_code: first.account_code,
      account_name: first.account_name,
      period: first.period,
      period_label: first.period_label,
      values: bucket.map((fact) => ({ amount: fact.amount, source_row: fact.source_row })),
    });
  }

  return { facts: preparedFacts, duplicatesRemoved, conflicts };
}
