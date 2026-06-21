import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type InviteInput = { email: string; name: string; password: string };

const PROTECTED_ADMIN_EMAIL = "admin@qaportal.app";

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

type AgentAuditAction =
  | "invite_created"
  | "invite_resent"
  | "invite_removed"
  | "agent_deactivated"
  | "agent_reactivated"
  | "agent_deleted";

// Loose typing on the admin client: importing the typed client at module
// scope would pull `client.server` into the client bundle. We accept `any`
// for the runtime-loaded admin client here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminLike = any;

async function logAgentAudit(
  supabaseAdmin: SupabaseAdminLike,
  entry: {
    action: AgentAuditAction;
    targetUserId?: string | null;
    targetEmail: string;
    targetName?: string | null;
    performedById?: string | null;
    performedByName?: string | null;
    details?: Record<string, unknown>;
  },
) {
  try {
    await supabaseAdmin.from("agent_audit_log").insert({
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      target_email: entry.targetEmail,
      target_name: entry.targetName ?? null,
      performed_by_id: entry.performedById ?? null,
      performed_by_name: entry.performedByName ?? null,
      details: entry.details ?? {},
    });
  } catch (e) {
    // Audit logging is best-effort; never block the action.
    console.warn("[agent_audit_log] write failed", e);
  }
}

async function getActorName(
  supabaseAdmin: SupabaseAdminLike,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("name")
      .eq("id", userId)
      .maybeSingle();
    return data?.name ?? null;
  } catch {
    return null;
  }
}

function generateStrongPassword(): string {
  // 18 chars, mix of letter classes + symbols. Avoid ambiguous chars.
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*?-_";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint8Array(18);
  // crypto is available in the Worker runtime
  crypto.getRandomValues(bytes);
  const pick = (set: string, n: number) => set[n % set.length];
  const out = [
    pick(upper, bytes[0]),
    pick(lower, bytes[1]),
    pick(digits, bytes[2]),
    pick(symbols, bytes[3]),
  ];
  for (let i = 4; i < bytes.length; i++) out.push(pick(all, bytes[i]));
  // Shuffle
  for (let i = out.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

export const inviteAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: InviteInput) => {
    if (!input || typeof input !== "object") throw new Error("Invalid input");
    const email = String(input.email || "")
      .trim()
      .toLowerCase();
    const name = String(input.name || "").trim();
    const password = String(input.password || "");
    if (!validateEmail(email)) throw new Error("Enter a valid email address");
    if (name.length < 2) throw new Error("Name is required");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    return { email, name, password };
  })
  .handler(async ({ data, context }) => {
    // Admin check via has_role function
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Only admins can invite agents");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name },
    });
    if (error) throw new Error(error.message);
    const userId = created.user?.id;
    if (!userId) throw new Error("User creation failed");

    // Trigger inserts agent role automatically; force-ensure it.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "agent" });
    await supabaseAdmin.from("profiles").update({ active: true, name: data.name }).eq("id", userId);

    const performedByName = await getActorName(supabaseAdmin, context.userId);
    await logAgentAudit(supabaseAdmin, {
      action: "invite_created",
      targetUserId: userId,
      targetEmail: data.email,
      targetName: data.name,
      performedById: context.userId,
      performedByName,
    });

    return { ok: true as const, userId, email: data.email };
  });

export const resetSampleAdmin = createServerFn({ method: "POST" }).handler(async () => {
  // Bootstrap-friendly: allowed when (a) no admin exists yet, or
  // (b) the caller is already an authenticated admin. This lets a brand-new
  // workspace mint the sample admin without first needing to log in.
  const SAMPLE_EMAIL = "admin@qaportal.app";
  // Generate a fresh random password each call so source-code access alone
  // does not yield working credentials. The plaintext is returned exactly
  // once to the caller (the authenticated Settings UI) and is never stored
  // alongside the account in plaintext.
  const SAMPLE_PASSWORD = generateStrongPassword();
  const SAMPLE_NAME = "Portal Admin";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Authorization gate: require admin caller UNLESS no admin exists yet.
  const { count: adminCount } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "admin");
  if ((adminCount ?? 0) > 0) {
    // Need a valid admin bearer token.
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const authHeader = req?.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) throw new Error("Only admins can reset the sample admin account");
    const { data: claims } = await supabaseAdmin.auth.getClaims(token);
    const callerId = claims?.claims?.sub;
    if (!callerId) throw new Error("Only admins can reset the sample admin account");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: callerId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can reset the sample admin account");
  }

  // Look for existing user via profiles
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", SAMPLE_EMAIL)
    .maybeSingle();

  let userId = existing?.id as string | undefined;
  if (userId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: SAMPLE_PASSWORD,
      email_confirm: true,
      user_metadata: { name: SAMPLE_NAME },
    });
    if (error) throw new Error(error.message);
  } else {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: SAMPLE_EMAIL,
      password: SAMPLE_PASSWORD,
      email_confirm: true,
      user_metadata: { name: SAMPLE_NAME },
    });
    if (error) throw new Error(error.message);
    userId = created.user?.id;
    if (!userId) throw new Error("Failed to create sample admin");
  }

  await supabaseAdmin.from("profiles").update({ name: SAMPLE_NAME, active: true }).eq("id", userId);
  await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "admin" });

  return { ok: true as const, email: SAMPLE_EMAIL, password: SAMPLE_PASSWORD, name: SAMPLE_NAME };
});

export const sampleAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Restrict to admin callers; non-admins should not be able to enumerate
    // whether the sample admin exists.
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, active")
      .eq("email", "admin@qaportal.app")
      .maybeSingle();
    if (!data?.id) return { exists: false as const };
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.id);
    const isAdminAcct = (roles ?? []).some((r) => r.role === "admin");
    return { exists: true as const, isAdmin: isAdminAcct, active: !!data.active };
  });

export const accountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => {
    const email = String(input?.email || "")
      .trim()
      .toLowerCase();
    if (!validateEmail(email)) throw new Error("Enter a valid email address");
    return { email };
  })
  .handler(async ({ data, context }) => {
    // Only allow callers to look up their OWN account, to prevent using this
    // endpoint as an email/role enumeration oracle.
    const callerEmail = String(
      (context.claims as { email?: string } | null | undefined)?.email ?? "",
    )
      .trim()
      .toLowerCase();
    if (!callerEmail || callerEmail !== data.email) {
      throw new Error("Forbidden");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, active, name")
      .eq("email", data.email)
      .maybeSingle();
    if (!profile?.id) return { exists: false as const };
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    const isAgent = (roles ?? []).some((r) => r.role === "agent");
    return {
      exists: true as const,
      active: !!profile.active,
      isAdmin,
      isAgent,
      hasRole: isAdmin || isAgent,
      name: profile.name as string | null,
    };
  });

/**
 * Soft-delete an agent: deactivate the auth user (block login), mark profile
 * inactive, and mark any agent_invites row as inactive. Defects/audit logs
 * are preserved because defects reference users by display name (text), not
 * by user_id.
 */
export const deactivateAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    const userId = String(input?.userId || "").trim();
    if (!userId) throw new Error("userId required");
    return { userId };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can remove agents");
    if (data.userId === context.userId) throw new Error("You cannot remove your own account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (profile?.email?.toLowerCase() === PROTECTED_ADMIN_EMAIL) {
      throw new Error("The main admin account cannot be removed");
    }
    // Mark profile inactive (blocks dashboard access via hydrate signOut)
    await supabaseAdmin.from("profiles").update({ active: false }).eq("id", data.userId);
    // Mark invite row inactive (if any)
    await supabaseAdmin
      .from("agent_invites")
      .update({ status: "inactive" })
      .eq("user_id", data.userId);
    // Revoke the password so the user cannot sign in again
    await supabaseAdmin.auth.admin
      .updateUserById(data.userId, { ban_duration: "876000h" })
      .catch(() => {});
    const performedByName = await getActorName(supabaseAdmin, context.userId);
    await logAgentAudit(supabaseAdmin, {
      action: "agent_deactivated",
      targetUserId: data.userId,
      targetEmail: profile?.email ?? "",
      performedById: context.userId,
      performedByName,
    });
    return { ok: true as const };
  });

export const reactivateAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    const userId = String(input?.userId || "").trim();
    if (!userId) throw new Error("userId required");
    return { userId };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can reactivate agents");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, name")
      .eq("id", data.userId)
      .maybeSingle();
    await supabaseAdmin.from("profiles").update({ active: true }).eq("id", data.userId);
    await supabaseAdmin
      .from("agent_invites")
      .update({ status: "active" })
      .eq("user_id", data.userId);
    await supabaseAdmin.auth.admin
      .updateUserById(data.userId, { ban_duration: "none" })
      .catch(() => {});
    const performedByName = await getActorName(supabaseAdmin, context.userId);
    await logAgentAudit(supabaseAdmin, {
      action: "agent_reactivated",
      targetUserId: data.userId,
      targetEmail: profile?.email ?? "",
      targetName: profile?.name ?? null,
      performedById: context.userId,
      performedByName,
    });
    return { ok: true as const };
  });

/**
 * Public (unauthenticated) check: is this email allowed to self-register?
 * Returns true only if an agent_invites row exists for the email and it is
 * not marked inactive. Used by the signup flow to enforce invite-only access.
 */
export const checkInviteEmail = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string }) => {
    const email = String(input?.email || "")
      .trim()
      .toLowerCase();
    if (!validateEmail(email)) throw new Error("Enter a valid email address");
    return { email };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("agent_invites")
      .select("status, user_id")
      .eq("email", data.email)
      .maybeSingle();
    if (!invite) return { allowed: false as const, reason: "not_invited" as const };
    if (invite.status === "inactive")
      return { allowed: false as const, reason: "inactive" as const };
    return { allowed: true as const, alreadyRegistered: !!invite.user_id };
  });

/**
 * Admin action: validate and "resend" an invite. Returns a clear status
 * so the UI can tell the admin whether the agent is still pending, is
 * already active, or was previously deactivated.
 */
export const resendAgentInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string }) => {
    const email = String(input?.email || "")
      .trim()
      .toLowerCase();
    if (!validateEmail(email)) throw new Error("Enter a valid email address");
    return { email };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can resend invites");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("agent_invites")
      .select("id, email, name, status, user_id")
      .eq("email", data.email)
      .maybeSingle();
    if (!invite) {
      return {
        ok: false as const,
        status: "not_invited" as const,
        message: "No invite exists for this email. Use Add Agent first.",
      };
    }
    if (invite.status === "inactive") {
      return {
        ok: false as const,
        status: "inactive" as const,
        message: "This agent was removed. Reactivate the account before resending an invite.",
      };
    }
    if (invite.user_id) {
      return {
        ok: false as const,
        status: "already_active" as const,
        message: `${invite.name} has already registered and is active. No invite is needed.`,
      };
    }

    // Touch updated_at so admins can see when the invite was last resent.
    await supabaseAdmin
      .from("agent_invites")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", invite.id);

    const performedByName = await getActorName(supabaseAdmin, context.userId);
    await logAgentAudit(supabaseAdmin, {
      action: "invite_resent",
      targetUserId: null,
      targetEmail: invite.email,
      targetName: invite.name,
      performedById: context.userId,
      performedByName,
    });

    return {
      ok: true as const,
      status: "pending" as const,
      message: `Invite link refreshed for ${invite.name}. They can now register at /login.`,
      email: invite.email,
      name: invite.name,
    };
  });

/**
 * Admin action: reset/change an agent's password. The new password is stored
 * securely (hashed) by Supabase Auth; we never persist plaintext.
 */
export const resetAgentPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password: string }) => {
    const userId = String(input?.userId || "").trim();
    const password = String(input?.password || "");
    if (!userId) throw new Error("userId required");
    if (password.length < 8) throw new Error("Password must be at least 8 characters");
    return { userId, password };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can reset agent passwords");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, name")
      .eq("id", data.userId)
      .maybeSingle();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    const performedByName = await getActorName(supabaseAdmin, context.userId);
    await logAgentAudit(supabaseAdmin, {
      action: "invite_resent", // reuse existing action enum value as best-fit
      targetUserId: data.userId,
      targetEmail: profile?.email ?? "",
      targetName: profile?.name ?? null,
      performedById: context.userId,
      performedByName,
      details: { kind: "password_reset" },
    });
    return { ok: true as const };
  });

/**
 * Admin action: update an agent's profile (name and/or role). Email changes
 * also propagate to the auth user.
 */
export const updateAgentProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      userId: string;
      name?: string;
      email?: string;
      role?: "admin" | "agent";
      active?: boolean;
    }) => {
      const userId = String(input?.userId || "").trim();
      if (!userId) throw new Error("userId required");
      const name = input.name == null ? undefined : String(input.name).trim();
      const email = input.email == null ? undefined : String(input.email).trim().toLowerCase();
      if (email !== undefined && !validateEmail(email))
        throw new Error("Enter a valid email address");
      if (name !== undefined && name.length < 2) throw new Error("Name is required");
      const role = input.role;
      if (role !== undefined && role !== "admin" && role !== "agent")
        throw new Error("Invalid role");
      return { userId, name, email, role, active: input.active };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can edit agents");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("email, name")
      .eq("id", data.userId)
      .maybeSingle();

    const profileUpdate: { name?: string; email?: string; active?: boolean } = {};
    if (data.name !== undefined) profileUpdate.name = data.name;
    if (data.email !== undefined) profileUpdate.email = data.email;
    if (data.active !== undefined) profileUpdate.active = data.active;
    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdate)
        .eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    if (data.email !== undefined && data.email !== existing?.email) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        email: data.email,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
    }
    if (data.name !== undefined) {
      await supabaseAdmin.auth.admin
        .updateUserById(data.userId, {
          user_metadata: { name: data.name },
        })
        .catch(() => {});
    }

    if (data.role !== undefined) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    }
    return { ok: true as const };
  });
