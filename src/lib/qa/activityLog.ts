import { supabase } from "@/integrations/supabase/client";

function getBrowserMeta() {
  if (typeof navigator === "undefined") return { ua: null as string | null };
  return { ua: navigator.userAgent };
}

/**
 * Record an auth event in the unified activity_log.
 * Requires a signed-in session for `login`/`profile_updated`/etc.
 * For pre-session events (failed login, signup-attempt) we no-op silently.
 */
export async function recordAuthEvent(opts: {
  kind: "login" | "logout" | "password_reset_requested" | "profile_updated" | "email_changed";
  email?: string;
  success?: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const { ua } = getBrowserMeta();
    const summary =
      opts.kind === "login" ? `${opts.email ?? "user"} signed in` :
      opts.kind === "logout" ? `${opts.email ?? "user"} signed out` :
      opts.kind === "password_reset_requested" ? `Password reset requested for ${opts.email ?? "unknown"}` :
      opts.kind === "profile_updated" ? `${opts.email ?? "user"} updated profile` :
      `${opts.email ?? "user"} changed email`;
    await supabase.rpc("log_activity", {
      _category: opts.kind === "profile_updated" || opts.kind === "email_changed" ? "user_mgmt" : "auth",
      _action: `auth.${opts.kind}`,
      _summary: summary,
      _record_type: "auth",
      _record_id: opts.email ?? null,
      _result: opts.success === false ? "failure" : "success",
      _ua: ua,
      _metadata: opts.metadata ? (opts.metadata as never) : (opts.reason ? ({ reason: opts.reason } as never) : null),
    });
  } catch (e) {
    // never block the user flow on audit failure
    console.warn("[activityLog] record failed", e);
  }
}