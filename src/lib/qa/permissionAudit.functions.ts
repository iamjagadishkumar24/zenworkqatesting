import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PermissionAuditRole = "admin" | "agent";
export type PermissionAuditAction = "view" | "create" | "edit" | "delete";

export type PermissionAuditDTO = {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string | null;
  targetUserId: string | null;
  targetUserName: string;
  targetRole: PermissionAuditRole;
  module: string;
  action: PermissionAuditAction;
  enabled: boolean;
};

const ACTIONS: readonly PermissionAuditAction[] = ["view", "create", "edit", "delete"];
const ROLES: readonly PermissionAuditRole[] = ["admin", "agent"];

function row(r: Record<string, unknown>): PermissionAuditDTO {
  return {
    id: String(r.id),
    at: String(r.at),
    actorId: (r.actor_id as string | null) ?? null,
    actorName: (r.actor_name as string | null) ?? null,
    targetUserId: (r.target_user_id as string | null) ?? null,
    targetUserName: String(r.target_user_name ?? ""),
    targetRole: (ROLES.includes(r.target_role as PermissionAuditRole)
      ? r.target_role
      : "agent") as PermissionAuditRole,
    module: String(r.module ?? ""),
    action: (ACTIONS.includes(r.action as PermissionAuditAction)
      ? r.action
      : "view") as PermissionAuditAction,
    enabled: !!r.enabled,
  };
}

/**
 * Belt-and-braces admin gate. RLS on `permission_audit` already restricts the
 * table to admins, but failing fast here returns a clear error to non-admin
 * callers instead of an empty row set.
 */
async function assertAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error("Authorization check failed");
  if (!data) throw new Error("Forbidden: admin role required");
}

export const listPermissionAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PermissionAuditDTO[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("permission_audit")
      .select("*")
      .order("at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: Record<string, unknown>) => row(r));
  });

export const recordPermissionAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as Record<string, unknown>;
    const role = String(o.targetRole ?? "");
    const action = String(o.action ?? "");
    if (!ROLES.includes(role as PermissionAuditRole)) {
      throw new Error("Invalid targetRole");
    }
    if (!ACTIONS.includes(action as PermissionAuditAction)) {
      throw new Error("Invalid action");
    }
    const module = String(o.module ?? "").trim().slice(0, 120);
    const targetUserName = String(o.targetUserName ?? "").trim().slice(0, 200);
    if (!module) throw new Error("module required");
    if (!targetUserName) throw new Error("targetUserName required");
    return {
      targetUserId:
        typeof o.targetUserId === "string" && o.targetUserId.length
          ? o.targetUserId
          : null,
      targetUserName,
      targetRole: role as PermissionAuditRole,
      module,
      action: action as PermissionAuditAction,
      enabled: !!o.enabled,
      actorName:
        typeof o.actorName === "string" ? o.actorName.trim().slice(0, 200) : null,
    };
  })
  .handler(async ({ data, context }): Promise<PermissionAuditDTO> => {
    await assertAdmin(context.supabase, context.userId);
    const { data: inserted, error } = await context.supabase
      .from("permission_audit")
      .insert({
        actor_id: context.userId,
        actor_name: data.actorName,
        target_user_id: data.targetUserId,
        target_user_name: data.targetUserName,
        target_role: data.targetRole,
        module: data.module,
        action: data.action,
        enabled: data.enabled,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row(inserted as Record<string, unknown>);
  });

export const clearPermissionAuditServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("permission_audit")
      .delete()
      .not("id", "is", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
