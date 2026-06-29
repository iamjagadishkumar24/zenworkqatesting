/**
 * Browser-side tracker for audit-log write failures.
 *
 * Compliance trails MUST NOT fail silently. Every code path that previously
 * swallowed an audit failure with `console.warn` now also calls
 * `recordAuditFailure(scope, error)`. The header surfaces an indicator
 * (visible to admins) and the store exposes a snapshot/metric for tests and
 * monitoring.
 *
 * The store is intentionally simple: in-memory, browser-only, last-N events.
 * Server-side audit failures bubble back to the client via the server fn
 * response (`{ auditWriteFailed: true, auditWriteScope }`) and the client
 * helper `trackAuditResult` forwards them here.
 */

export type AuditFailureScope =
  | "activity_log"
  | "auth_attempt"
  | "agent_audit_log"
  | "qa_runtime_config_audit"
  | "other";

export type AuditFailureEntry = {
  scope: AuditFailureScope;
  message: string;
  at: number;
};

export type AuditFailureSnapshot = {
  totalCount: number;
  perScope: Record<AuditFailureScope, number>;
  recent: AuditFailureEntry[];
  lastAt: number | null;
};

const MAX_RECENT = 20;

const initialPerScope = (): Record<AuditFailureScope, number> => ({
  activity_log: 0,
  auth_attempt: 0,
  agent_audit_log: 0,
  qa_runtime_config_audit: 0,
  other: 0,
});

const state: AuditFailureSnapshot = {
  totalCount: 0,
  perScope: initialPerScope(),
  recent: [],
  lastAt: null,
};

type Listener = (snap: AuditFailureSnapshot) => void;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(getAuditFailureSnapshot());
}

function safeMessage(error: unknown): string {
  if (!error) return "Unknown audit write failure";
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error).slice(0, 280);
  } catch {
    return String(error);
  }
}

/** Record a single audit-write failure. Safe to call from any context. */
export function recordAuditFailure(scope: AuditFailureScope, error: unknown): void {
  const entry: AuditFailureEntry = {
    scope,
    message: safeMessage(error),
    at: Date.now(),
  };
  state.totalCount += 1;
  state.perScope[scope] = (state.perScope[scope] ?? 0) + 1;
  state.lastAt = entry.at;
  state.recent.unshift(entry);
  if (state.recent.length > MAX_RECENT) state.recent.length = MAX_RECENT;
  // Keep the existing developer signal too.
  if (typeof console !== "undefined") {
    console.warn(`[audit-failure:${scope}] ${entry.message}`);
  }
  emit();
}

/** Read-only snapshot for components and tests. */
export function getAuditFailureSnapshot(): AuditFailureSnapshot {
  return {
    totalCount: state.totalCount,
    perScope: { ...state.perScope },
    recent: state.recent.slice(),
    lastAt: state.lastAt,
  };
}

export function clearAuditFailures(): void {
  state.totalCount = 0;
  state.perScope = initialPerScope();
  state.recent = [];
  state.lastAt = null;
  emit();
}

export function subscribeToAuditFailures(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Helper for client callers of server functions whose response may include
 * an `auditWriteFailed` flag (set when the server-side audit insert errored
 * but the primary operation succeeded). Returns the original result.
 */
export function trackAuditResult<T extends Record<string, unknown> | void | null | undefined>(
  scope: AuditFailureScope,
  result: T,
): T {
  if (
    result &&
    typeof result === "object" &&
    "auditWriteFailed" in result &&
    (result as Record<string, unknown>).auditWriteFailed === true
  ) {
    const msg =
      typeof (result as Record<string, unknown>).auditWriteError === "string"
        ? ((result as Record<string, unknown>).auditWriteError as string)
        : "Server-side audit insert failed";
    recordAuditFailure(scope, msg);
  }
  return result;
}