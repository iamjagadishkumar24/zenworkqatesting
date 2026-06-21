import { supabase } from "@/integrations/supabase/client";

type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lastNetworkRequest?: {
      url: string;
      method: string;
      status?: number;
      ok?: boolean;
      error?: string;
      at: string;
    };
  }
}

// Best-effort: keep a tiny rolling cache so we don't spam the table if
// the same error fires in a loop (e.g. render storm).
const RECENT_ERRORS = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;

function shouldReport(key: string): boolean {
  const now = Date.now();
  for (const [k, t] of RECENT_ERRORS) {
    if (now - t > DEDUPE_WINDOW_MS) RECENT_ERRORS.delete(k);
  }
  const last = RECENT_ERRORS.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  RECENT_ERRORS.set(key, now);
  return true;
}

async function persistErrorLog(error: unknown, context: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    const dedupeKey = `${err.name}:${err.message}:${context.boundary ?? ""}:${window.location.pathname}`;
    if (!shouldReport(dedupeKey)) return;

    let actor_id: string | null = null;
    let actor_email: string | null = null;
    let actor_role: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      actor_id = data.user?.id ?? null;
      actor_email = data.user?.email ?? null;
      if (actor_id) {
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", actor_id)
          .maybeSingle();
        actor_role = (roleRow as { role?: string } | null)?.role ?? null;
      }
    } catch {
      // ignore — error logging must never throw
    }

    await supabase.from("error_logs").insert({
      actor_id,
      actor_email,
      actor_role,
      route: window.location.pathname,
      component: (context.boundary as string | undefined) ?? null,
      message: err.message,
      stack: err.stack ?? null,
      source: (context.source as string | undefined) ?? null,
      last_request: window.__lastNetworkRequest ?? null,
      user_agent: navigator.userAgent,
      url: window.location.href,
      metadata: context as Record<string, unknown>,
    });
  } catch {
    // never throw from logging
  }
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context,
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error",
    },
  );
  void persistErrorLog(error, context);
}
