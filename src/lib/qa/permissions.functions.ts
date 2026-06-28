import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PermAction = "view" | "create" | "edit" | "delete";
export type PermissionOverride = { module: string; action: PermAction; enabled: boolean };

const ACTIONS: readonly PermAction[] = ["view", "create", "edit", "delete"];

function validAction(a: unknown): PermAction {
  if (typeof a !== "string" || !ACTIONS.includes(a as PermAction)) {
    throw new Error("Invalid action");
  }
  return a as PermAction;
}

/** List the caller's own permission overrides. Safe for any signed-in user. */
export const listMyPermissionOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PermissionOverride[]> => {
    const { data, error } = await context.supabase.rpc(
      "list_user_permission_overrides",
      { _user_id: context.userId },
    );
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      module: String(r.module),
      action: validAction(r.action),
      enabled: !!r.enabled,
    }));
  });

/** Admin-only: list overrides for any user. RLS / RPC re-enforces admin. */
export const listUserPermissionOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as Record<string, unknown>;
    const userId = typeof o.userId === "string" ? o.userId : "";
    if (!userId) throw new Error("userId required");
    return { userId };
  })
  .handler(async ({ data, context }): Promise<PermissionOverride[]> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { data: rows, error } = await context.supabase.rpc(
      "list_user_permission_overrides",
      { _user_id: data.userId },
    );
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: Record<string, unknown>) => ({
      module: String(r.module),
      action: validAction(r.action),
      enabled: !!r.enabled,
    }));
  });

/** Admin-only: upsert a single permission override. */
export const setUserPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as Record<string, unknown>;
    const targetUserId = typeof o.targetUserId === "string" ? o.targetUserId : "";
    const moduleName = typeof o.module === "string" ? o.module.trim() : "";
    if (!targetUserId) throw new Error("targetUserId required");
    if (!moduleName) throw new Error("module required");
    return {
      targetUserId,
      module: moduleName.slice(0, 120),
      action: validAction(o.action),
      enabled: !!o.enabled,
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("set_user_permission", {
      _target_user_id: data.targetUserId,
      _module: data.module,
      _action: data.action,
      _enabled: data.enabled,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Server-side helper for action authorization inside other server fns.
 * Throws when the caller lacks the requested permission.
 */
export async function assertPermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  moduleName: string,
  action: PermAction,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _module: moduleName,
    _action: action,
  });
  if (error) throw new Error("Authorization check failed");
  if (!data) throw new Error(`Forbidden: missing ${action} permission on ${moduleName}`);
}