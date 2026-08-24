import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roleList = (roles ?? []).map((r) => r.role);
    return {
      id: context.userId,
      email: profile?.email ?? null,
      fullName: profile?.full_name ?? null,
      isAdmin: roleList.includes("admin"),
      roles: roleList,
    };
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: client, error } = await context.supabase
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) throw new Error("Cliente não encontrado ou sem permissão de acesso.");
    return client;
  });

const clientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  trade_name: z.string().trim().max(120).nullable(),
  industry: z.string().trim().max(80).nullable(),
  segment: z.string().trim().max(80).nullable(),
  revenue_model: z.string().trim().max(120).nullable(),
  dimensions: z.array(z.string().trim().max(40)).max(20),
  active: z.boolean(),
});

export const saveClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid().nullable(), values: clientSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await context.supabase
        .from("clients")
        .update(data.values)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("clients")
      .insert({ ...data.values, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ clientId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, email, full_name")
      .order("email");
    const { data: access } = await context.supabase
      .from("client_users")
      .select("user_id")
      .eq("client_id", data.clientId);
    const granted = new Set((access ?? []).map((a) => a.user_id));
    return (profiles ?? []).map((p) => ({ ...p, hasAccess: granted.has(p.id) }));
  });

export const setClientAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ clientId: z.string().uuid(), userId: z.string().uuid(), grant: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.grant) {
      const { error } = await context.supabase
        .from("client_users")
        .upsert(
          { client_id: data.clientId, user_id: data.userId },
          { onConflict: "client_id,user_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("client_users")
        .delete()
        .eq("client_id", data.clientId)
        .eq("user_id", data.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
