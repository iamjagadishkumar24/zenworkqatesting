import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type QARuntimeConfig = {
  /** When false, the QA store skips opening the Realtime channel entirely. */
  liveEnabled: boolean;
  /**
   * When true, the store batches all realtime-driven state updates inside a
   * single rAF frame to keep the UI smooth under heavy event load. The
   * feature is fully backend-driven — no UI control is exposed.
   */
  performanceMode: boolean;
  /** ISO timestamp of the last admin update, when sourced from the DB. */
  updatedAt?: string | null;
};

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

/**
 * Public, unauthenticated config endpoint. Reads the singleton row from
 * `qa_runtime_config` so admins can toggle live execution and performance
 * mode at runtime (via the Admin Settings UI) without redeploying.
 * Falls back to env vars (LIVE_EXECUTION_ENABLED / REALTIME_PERFORMANCE_MODE)
 * if the DB row is unreachable.
 */
export const getQARuntimeConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<QARuntimeConfig> => {
    const fallback: QARuntimeConfig = {
      liveEnabled: envBool("LIVE_EXECUTION_ENABLED", true),
      performanceMode: envBool("REALTIME_PERFORMANCE_MODE", false),
      updatedAt: null,
    };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("qa_runtime_config")
        .select("live_enabled, performance_mode, updated_at")
        .eq("id", "default")
        .maybeSingle();
      if (error || !data) return fallback;
      return {
        liveEnabled: !!data.live_enabled,
        performanceMode: !!data.performance_mode,
        updatedAt: data.updated_at ?? null,
      };
    } catch {
      return fallback;
    }
  },
);

/**
 * Admin-only: update the runtime config singleton. Requires the calling user
 * to have the `admin` role via `has_role`.
 */
export const updateQARuntimeConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { liveEnabled: boolean; performanceMode: boolean }) => {
      if (typeof data?.liveEnabled !== "boolean" || typeof data?.performanceMode !== "boolean") {
        throw new Error("Invalid payload");
      }
      return { liveEnabled: data.liveEnabled, performanceMode: data.performanceMode };
    },
  )
  .handler(async ({ data, context }): Promise<QARuntimeConfig> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) {
      throw new Response("Forbidden", { status: 403 });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("qa_runtime_config")
      .upsert(
        {
          id: "default",
          live_enabled: data.liveEnabled,
          performance_mode: data.performanceMode,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        },
        { onConflict: "id" },
      )
      .select("live_enabled, performance_mode, updated_at")
      .single();
    if (error || !row) {
      throw new Error(error?.message ?? "Failed to update runtime config");
    }
    return {
      liveEnabled: !!row.live_enabled,
      performanceMode: !!row.performance_mode,
      updatedAt: row.updated_at ?? null,
    };
  });