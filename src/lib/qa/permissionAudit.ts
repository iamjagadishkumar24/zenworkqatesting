// Module-level store for permission-change audit events.
// Shared between the Rights Management page (writes) and the
// Permission Audit History page in Settings (reads).

export type PermissionAuditEntry = {
  id: string;
  at: string;
  userId: string;
  userName: string;
  role: "admin" | "agent";
  module: string;
  action: "view" | "create" | "edit" | "delete";
  enabled: boolean;
};

const STORAGE_KEY = "qa.permissionAudit.v1";
const MAX = 500;

function safeRead(): PermissionAuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PermissionAuditEntry[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(entries: PermissionAuditEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota / privacy mode failures
  }
}

let entries: PermissionAuditEntry[] = safeRead();
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function getPermissionAudit(): PermissionAuditEntry[] {
  return entries;
}

/**
 * Hydrate from the admin-only `permission_audit` table. Non-admins receive
 * Forbidden/empty results (RLS + server-fn admin check), so this resolves
 * with an empty list for them — the in-memory cache simply stays empty.
 */
export async function hydratePermissionAudit(): Promise<void> {
  if (hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const mod = await import("./permissionAudit.functions");
      const rows = await mod.listPermissionAudit();
      entries = rows.map((r) => ({
        id: r.id,
        at: r.at,
        userId: r.targetUserId ?? "",
        userName: r.targetUserName,
        role: r.targetRole,
        module: r.module,
        action: r.action,
        enabled: r.enabled,
      }));
      safeWrite(entries);
      hydrated = true;
      emit();
    } catch {
      // Forbidden / offline — keep whatever is cached locally.
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

export function subscribePermissionAudit(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function recordPermissionChange(
  entry: Omit<PermissionAuditEntry, "id" | "at">,
): PermissionAuditEntry {
  const next: PermissionAuditEntry = {
    ...entry,
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    at: new Date().toISOString(),
  };
  entries = [next, ...entries].slice(0, MAX);
  safeWrite(entries);
  emit();
  // Persist to the admin-only audit table. Non-admins are rejected by RLS
  // and the server-fn admin gate, so the write fails silently for them and
  // the local entry remains a UI-only artifact.
  void (async () => {
    try {
      const mod = await import("./permissionAudit.functions");
      await mod.recordPermissionAudit({
        data: {
          targetUserId: entry.userId || null,
          targetUserName: entry.userName,
          targetRole: entry.role,
          module: entry.module,
          action: entry.action,
          enabled: entry.enabled,
          actorName: null,
        },
      });
    } catch {
      // Surface handled by caller toasts; don't block UI here.
    }
  })();
  return next;
}

export function clearPermissionAudit() {
  entries = [];
  safeWrite(entries);
  emit();
  void (async () => {
    try {
      const mod = await import("./permissionAudit.functions");
      await mod.clearPermissionAuditServer();
    } catch {
      /* non-admin / offline */
    }
  })();
}

// Test-only reset hook.
export function __resetPermissionAuditForTests() {
  entries = [];
  listeners.clear();
  hydrated = false;
  hydrating = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }
}