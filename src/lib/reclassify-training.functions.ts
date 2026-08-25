import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import { classifyEntry, historyKey, type RuleLike } from "./classify";
import { mergeHistoryCandidates, type HistoryCandidate } from "./classification-history";
import { findStructuredTrainingMatch } from "./structured-training-match";

const STRUCTURED_TRAINING_CONFIDENCE = 0.72;
const STRUCTURED_TRAINING_SOURCE = "training_structured";
const BALANCE_TRAINING_SOURCE = "training_balance_exact";

/**
 * Autoridade conceitual da origem. Nao usamos apenas o percentual de confianca:
 * uma fonte mais recente e mais governada pode corrigir uma classificacao automatica
 * antiga mesmo quando o score numerico antigo era maior.
 *
 * Confirmados humanos e ignorados nao entram no reprocessamento.
 */
export function classificationSourceAuthority(source: string | null | undefined): number {
  switch (source) {
    case "confirmacao_humana":
    case "confirmacao_humana_balanco":
    case "training_human_balance":
      return 100;
    case "regra_confirmada_cliente":
      return 90;
    case BALANCE_TRAINING_SOURCE:
      return 80;
    case STRUCTURED_TRAINING_SOURCE:
      return 70;
    case "historico_cliente":
      return 60;
    case "regra_cliente":
      return 55;
    case "regra_segmento":
      return 40;
    case "regra_geral":
      return 30;
    case "fornecedor":
      return 20;
    case "sem_correspondencia":
    default:
      return 0;
  }
}

export const reclassifyPendingFromLearning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, segment")
      .eq("id", data.clientId)
      .maybeSingle();
    if (clientError) throw new Error(clientError.message);
    if (!client) throw new Error("Cliente não encontrado ou sem permissão de acesso.");

    const { data: rules, error: rulesError } = await supabase
      .from("rules")
      .select("*")
      .eq("active", true)
      .eq("statement_type", "resultado")
      .or(`client_id.eq.${data.clientId},client_id.is.null`);
    if (rulesError) throw new Error(rulesError.message);

    // Somente conhecimento confirmado por humano alimenta o historico de entries.
    // Automacoes antigas nao podem se autorreforcar durante o reprocessamento.
    const { data: historyRows, error: historyError } = await supabase
      .from("entries")
      .select("description, counterparty, account, nature, behavior, area")
      .eq("client_id", data.clientId)
      .eq("statement_type", "resultado")
      .eq("status", "confirmado")
      .not("account", "is", null)
      .limit(5000);
    if (historyError) throw new Error(historyError.message);

    const { data: trainingRows, error: trainingError } = await supabase
      .from("training_examples")
      .select("history_key, account, nature, behavior, area")
      .eq("client_id", data.clientId)
      .eq("statement_type", "resultado")
      .eq("active", true)
      .limit(5000);
    if (trainingError) throw new Error(trainingError.message);

    const { data: balanceTrainingRows, error: balanceTrainingError } = await supabase
      .from("training_examples")
      .select("history_key, account, balance_group")
      .eq("client_id", data.clientId)
      .eq("statement_type", "balanco")
      .eq("active", true)
      .not("account", "is", null)
      .not("balance_group", "is", null)
      .limit(5000);
    if (balanceTrainingError) throw new Error(balanceTrainingError.message);

    const balanceByKey = new Map<
      string,
      { account: string; balanceGroup: "ativo" | "passivo" | "patrimonio_liquido" }
    >();
    const balanceConflicts = new Set<string>();
    for (const row of balanceTrainingRows ?? []) {
      if (!row.history_key || !row.account || !row.balance_group) continue;
      const candidate = {
        account: row.account,
        balanceGroup: row.balance_group as "ativo" | "passivo" | "patrimonio_liquido",
      };
      const prior = balanceByKey.get(row.history_key);
      if (
        prior &&
        (prior.account !== candidate.account || prior.balanceGroup !== candidate.balanceGroup)
      ) {
        balanceConflicts.add(row.history_key);
        balanceByKey.delete(row.history_key);
        continue;
      }
      if (!balanceConflicts.has(row.history_key)) balanceByKey.set(row.history_key, candidate);
    }

    const candidates: HistoryCandidate[] = [];
    for (const row of historyRows ?? []) {
      const key = historyKey({ description: row.description, counterparty: row.counterparty });
      if (!key || !row.account) continue;
      candidates.push({
        key,
        account: row.account,
        nature: row.nature,
        behavior: row.behavior,
        area: row.area,
        source: "entry",
      });
    }
    for (const row of trainingRows ?? []) {
      if (!row.history_key || !row.account) continue;
      candidates.push({
        key: row.history_key,
        account: row.account,
        nature: row.nature,
        behavior: row.behavior,
        area: row.area,
        source: "training",
      });
    }

    const { history, conflicts } = mergeHistoryCandidates(candidates);

    // Reprocessa pendentes e automaticos. Confirmados humanos e ignorados ficam imutaveis.
    const { data: rowsToReview, error: reviewError } = await supabase
      .from("entries")
      .select(
        "id, description, counterparty, original_category, amount, account, nature, behavior, area, status, statement_type, balance_group, classification_source, confidence, excluded_from_dre",
      )
      .eq("client_id", data.clientId)
      .in("status", ["pendente", "auto"])
      .limit(5000);
    if (reviewError) throw new Error(reviewError.message);

    let automatic = 0;
    let suggested = 0;
    let structuredSuggested = 0;
    let balanceAutomatic = 0;
    let revisedAutomatic = 0;
    let unchanged = 0;
    const auditRows: TablesInsert<"classification_audit">[] = [];

    for (const row of rowsToReview ?? []) {
      const key = historyKey({ description: row.description, counterparty: row.counterparty });
      const balanceMatch = key && !balanceConflicts.has(key) ? balanceByKey.get(key) : undefined;

      const rawEntry = {
        description: row.description,
        counterparty: row.counterparty,
        original_category: row.original_category,
        amount: Number(row.amount),
      };

      const result = classifyEntry(rawEntry, {
        clientId: data.clientId,
        segment: client.segment,
        rules: (rules ?? []) as unknown as RuleLike[],
        history,
      });

      type NextCandidate = {
        account: string | null;
        nature: typeof row.nature;
        behavior: typeof row.behavior;
        area: string | null;
        statementType: "resultado" | "balanco";
        balanceGroup: "ativo" | "passivo" | "patrimonio_liquido" | null;
        confidence: number;
        source: string;
        status: "auto" | "sugerido" | "pendente";
        excludedFromDre: boolean;
      };

      let next: NextCandidate = {
        account: result.account,
        nature: result.nature,
        behavior: result.behavior,
        area: result.area,
        statementType: "resultado",
        balanceGroup: null,
        confidence: result.confidence,
        source: result.source,
        status: result.status,
        excludedFromDre: result.nature === "excluido",
      };

      if (
        balanceMatch &&
        classificationSourceAuthority(BALANCE_TRAINING_SOURCE) >
          classificationSourceAuthority(next.source)
      ) {
        next = {
          account: balanceMatch.account,
          nature: "nao_definido",
          behavior: "nao_definido",
          area: null,
          statementType: "balanco",
          balanceGroup: balanceMatch.balanceGroup,
          confidence: 1,
          source: BALANCE_TRAINING_SOURCE,
          status: "auto",
          excludedFromDre: true,
        };
      }

      if (next.status === "pendente" || !next.account) {
        const structured = key ? findStructuredTrainingMatch(rawEntry, history, key) : null;
        if (structured) {
          next = {
            account: structured.history.account,
            nature: structured.history.nature,
            behavior: structured.history.behavior,
            area: structured.history.area,
            statementType: "resultado",
            balanceGroup: null,
            confidence: STRUCTURED_TRAINING_CONFIDENCE,
            source: STRUCTURED_TRAINING_SOURCE,
            status: "sugerido",
            excludedFromDre: structured.history.nature === "excluido",
          };
          structuredSuggested += 1;
        }
      }

      if (next.status === "pendente" || !next.account) {
        unchanged += 1;
        continue;
      }

      if (row.status === "auto") {
        const currentAuthority = classificationSourceAuthority(row.classification_source);
        const nextAuthority = classificationSourceAuthority(next.source);
        if (nextAuthority <= currentAuthority) {
          unchanged += 1;
          continue;
        }
      }

      const { error: updateError } = await supabase
        .from("entries")
        .update({
          account: next.account,
          nature: next.nature,
          behavior: next.behavior,
          area: next.area,
          statement_type: next.statementType,
          balance_group: next.balanceGroup,
          confidence: next.confidence,
          classification_source: next.source,
          status: next.status,
          excluded_from_dre: next.excludedFromDre,
        })
        .eq("client_id", data.clientId)
        .eq("id", row.id)
        .eq("status", row.status);
      if (updateError) throw new Error(updateError.message);

      if (row.status === "auto") revisedAutomatic += 1;
      if (next.status === "auto") automatic += 1;
      else suggested += 1;
      if (next.source === BALANCE_TRAINING_SOURCE) balanceAutomatic += 1;

      auditRows.push({
        client_id: data.clientId,
        entry_id: row.id,
        user_id: context.userId,
        previous: {
          account: row.account,
          nature: row.nature,
          behavior: row.behavior,
          area: row.area,
          statement_type: row.statement_type,
          balance_group: row.balance_group,
          status: row.status,
          classification_source: row.classification_source,
          confidence: row.confidence,
          excluded_from_dre: row.excluded_from_dre,
        } as Json,
        next: {
          account: next.account,
          nature: next.nature,
          behavior: next.behavior,
          area: next.area,
          statement_type: next.statementType,
          balance_group: next.balanceGroup,
          status: next.status,
          classification_source: next.source,
          confidence: next.confidence,
          excluded_from_dre: next.excludedFromDre,
        } as Json,
        source: row.status === "auto" ? `reprocess_override:${next.source}` : next.source,
        confidence: next.confidence,
        became_rule: false,
      });
    }

    for (let i = 0; i < auditRows.length; i += 400) {
      const { error: auditError } = await supabase
        .from("classification_audit")
        .insert(auditRows.slice(i, i + 400));
      if (auditError) throw new Error(auditError.message);
    }

    return {
      analyzed: rowsToReview?.length ?? 0,
      automatic,
      suggested,
      structuredSuggested,
      balanceAutomatic,
      revisedAutomatic,
      remaining: unchanged,
      historyExamples: history.length,
      historyConflicts: conflicts.size + balanceConflicts.size,
    };
  });
