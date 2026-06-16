import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type InviteInput = { email: string; name: string; password: string };

const PROTECTED_ADMIN_EMAIL = "admin@qaportal.app";

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    const email = String(input.email || "").trim().toLowerCase();
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

    return { ok: true as const, userId, email: data.email };
  });

export const resetSampleAdmin = createServerFn({ method: "POST" })
  .handler(async () => {
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
    const email = String(input?.email || "").trim().toLowerCase();
    if (!validateEmail(email)) throw new Error("Enter a valid email address");
    return { email };
  })
  .handler(async ({ data, context }) => {
    // Only allow callers to look up their OWN account, to prevent using this
    // endpoint as an email/role enumeration oracle.
    const callerEmail = String(
      (context.claims as { email?: string } | null | undefined)?.email ?? "",
    ).trim().toLowerCase();
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