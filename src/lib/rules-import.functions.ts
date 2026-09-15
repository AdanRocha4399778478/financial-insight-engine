import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalize } from "./classify";
import { BEHAVIORS, NATURES } from "./finance";

const natureEnum = z.enum(NATURES as [string, ...string[]]);
const behaviorEnum = z.enum(BEHAVIORS as [string, ...string[]]);

const ruleSchema = z.object({
  pattern: z.string().trim().min(1).max(200),
  match_field: z.enum(["description", "counterparty"]),
  account: z.string().trim().min(1).max(120),
  nature: natureEnum,
  behavior: behaviorEnum,
  area: z.string().trim().max(80).nullable(),
  client_id: z.string().uuid().nullable(),
  client_name: z.string().max(120).nullable(),
  source_row: z.number(),
});

export type RuleImportInput = z.infer<typeof ruleSchema>;

const key = (clientId: string | null, matchField: string, pattern: string) =>
  `${clientId ?? "global"}::${matchField}::${normalize(pattern)}`;

interface ExistingRule {
  id: string;
  client_id: string | null;
  match_field: string;
  pattern: string;
  account: string;
  nature: string;
  behavior: string;
  area: string | null;
}

async function loadExisting(
  supabase: { from: (t: string) => any },
): Promise<Map<string, ExistingRule>> {
  const { data, error } = await supabase
    .from("rules")
    .select("id, client_id, match_field, pattern, account, nature, behavior, area")
    .eq("active", true)
    .limit(5000);
  if (error) throw new Error(error.message);
  const map = new Map<string, ExistingRule>();
  for (const rule of (data ?? []) as ExistingRule[]) {
    map.set(key(rule.client_id, rule.match_field, rule.pattern), rule);
  }
  return map;
}

export const previewRulesImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ rules: z.array(ruleSchema).max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    const existing = await loadExisting(context.supabase as never);
    const conflicts = data.rules
      .map((rule) => {
        const current = existing.get(key(rule.client_id, rule.match_field, rule.pattern));
        if (!current) return null;
        return {
          source_row: rule.source_row,
          pattern: rule.pattern,
          match_field: rule.match_field,
          client_name: rule.client_name,
          current: {
            account: current.account,
            nature: current.nature,
            behavior: current.behavior,
            area: current.area,
          },
          next: {
            account: rule.account,
            nature: rule.nature,
            behavior: rule.behavior,
            area: rule.area,
          },
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return { total: data.rules.length, conflicts, newCount: data.rules.length - conflicts.length };
  });

export const commitRulesImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        clientId: z.string().uuid(),
        rules: z.array(ruleSchema).min(1).max(2000),
        overwrite: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const existing = await loadExisting(supabase as never);

    const toInsert: RuleImportInput[] = [];
    const toUpdate: { rule: RuleImportInput; current: ExistingRule }[] = [];
    let skipped = 0;

    for (const rule of data.rules) {
      const current = existing.get(key(rule.client_id, rule.match_field, rule.pattern));
      if (!current) toInsert.push(rule);
      else if (data.overwrite) toUpdate.push({ rule, current });
      else skipped += 1;
    }

    const auditRows: Record<string, unknown>[] = [];

    if (toInsert.length) {
      const { error } = await supabase.from("rules").insert(
        toInsert.map((rule) => ({
          client_id: rule.client_id,
          match_field: rule.match_field,
          pattern: rule.pattern,
          account: rule.account,
          nature: rule.nature as never,
          behavior: rule.behavior as never,
          area: rule.area,
          confirmed: true,
          active: true,
          created_by: context.userId,
        })),
      );
      if (error) throw new Error(error.message);
      for (const rule of toInsert) {
        auditRows.push({
          client_id: data.clientId,
          entry_id: null,
          user_id: context.userId,
          previous: null,
          next: {
            rule_pattern: rule.pattern,
            match_field: rule.match_field,
            rule_client_id: rule.client_id,
            account: rule.account,
            nature: rule.nature,
            behavior: rule.behavior,
            area: rule.area,
            operacao: "criada",
          },
          source: "importacao_regras_lote",
          confidence: 1,
          became_rule: true,
        });
      }
    }

    for (const { rule, current } of toUpdate) {
      const { error } = await supabase
        .from("rules")
        .update({
          account: rule.account,
          nature: rule.nature as never,
          behavior: rule.behavior as never,
          area: rule.area,
          confirmed: true,
        })
        .eq("id", current.id);
      if (error) throw new Error(error.message);
      auditRows.push({
        client_id: data.clientId,
        entry_id: null,
        user_id: context.userId,
        previous: {
          rule_pattern: current.pattern,
          match_field: current.match_field,
          account: current.account,
          nature: current.nature,
          behavior: current.behavior,
          area: current.area,
        },
        next: {
          rule_pattern: rule.pattern,
          match_field: rule.match_field,
          rule_client_id: rule.client_id,
          account: rule.account,
          nature: rule.nature,
          behavior: rule.behavior,
          area: rule.area,
          operacao: "sobrescrita",
        },
        source: "importacao_regras_lote",
        confidence: 1,
        became_rule: true,
      });
    }

    if (auditRows.length) {
      await supabase.from("classification_audit").insert(auditRows as never);
    }

    return { created: toInsert.length, updated: toUpdate.length, skipped };
  });
