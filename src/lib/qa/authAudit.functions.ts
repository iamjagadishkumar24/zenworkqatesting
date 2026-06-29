import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Public server function that records an authentication attempt (success or
 * failure) to `activity_log`. Public — no `requireSupabaseAuth` — because it
 * must run on failed sign-in / failed sign-up where there is no session yet.
 * Uses the service role (admin) client to bypass RLS. Email is normalised
 * and metadata is whitelisted/size-capped so this endpoint cannot be abused
 * to inject arbitrary records.
 */
const schema = z.object({
  kind: z.enum([
    "login_success",
    "login_failure",
    "signup_success",
    "signup_failure",
    "password_reset_requested",
    "leaked_password_blocked",
  ]),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  reason: z.string().trim().max(280).optional(),
  user_agent: z.string().max(512).optional(),
});

export const recordAuthAttempt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isSuccess = data.kind.endsWith("_success");
    const summary =
      data.kind === "login_success"
        ? `${data.email ?? "user"} signed in`
        : data.kind === "login_failure"
          ? `Failed sign-in for ${data.email ?? "unknown"}`
          : data.kind === "signup_success"
            ? `${data.email ?? "user"} signed up`
            : data.kind === "signup_failure"
              ? `Failed sign-up for ${data.email ?? "unknown"}`
              : data.kind === "leaked_password_blocked"
                ? `Leaked password blocked for ${data.email ?? "unknown"}`
                : `Password reset requested for ${data.email ?? "unknown"}`;
    const { error } = await supabaseAdmin.from("activity_log").insert({
      category: "auth",
      action: `auth.${data.kind}`,
      record_type: "auth",
      record_id: data.email ?? null,
      summary,
      result: isSuccess ? "success" : "failure",
      actor_email: data.email ?? null,
      user_agent: data.user_agent ?? null,
      metadata: data.reason ? { reason: data.reason } : null,
    });
    if (error) {
      console.warn("[authAudit] insert failed", error);
      return {
        ok: true,
        auditWriteFailed: true,
        auditWriteError: error.message ?? "audit insert failed",
      } as const;
    }
    return { ok: true, auditWriteFailed: false } as const;
  });
