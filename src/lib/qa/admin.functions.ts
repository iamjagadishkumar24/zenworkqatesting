import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type InviteInput = { email: string; name: string; password: string };

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Only admins can reset the sample admin account");

    const SAMPLE_EMAIL = "admin@qaportal.app";
    const SAMPLE_PASSWORD = "Admin@12345";
    const SAMPLE_NAME = "Portal Admin";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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