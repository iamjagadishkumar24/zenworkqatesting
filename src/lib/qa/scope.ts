// Pure helpers for scoping data by environment and reporter.
// Kept dependency-free so they can be unit-tested without React/router.

export function filterByEnvironment<T extends { environment?: string | null }>(
  items: T[],
  env: string | null | undefined,
): T[] {
  if (!env) return items;
  return items.filter((i) => !i.environment || i.environment === env);
}

export function filterReportedBy<T extends { createdBy: string }>(
  items: T[],
  userName: string,
): T[] {
  return items.filter((i) => i.createdBy === userName);
}

export function scopeForUser<T extends { createdBy: string; assignedAgent?: string }>(
  items: T[],
  user: { name: string; role: "admin" | "agent" } | null,
): T[] {
  if (!user) return [];
  if (user.role === "admin") return items;
  return items.filter((d) => d.createdBy === user.name);
}

// Strict filters used by the Forms and 1099 Online catalogs to guarantee that
// 2290-related entries (e.g. "Form 2290", "EZ2290", "2290.us", "GT2290") never
// appear outside the dedicated 2290 Forms module.
export function isTwoTwoNinetyName(name: string): boolean {
  return /(^|\b)(2290|ez2290|gt2290)\b/i.test(name);
}

export function excludeNonCatalogForms(names: string[]): string[] {
  return names.filter((n) => !isTwoTwoNinetyName(n));
}

// -------- Role-based access (client-side guidance) -----------------------
// Hard authorization is enforced by Postgres RLS + has_role() in the DB.
// These helpers mirror those rules so the UI can hide/disable actions and
// be unit-tested in isolation.

export type AppRole = "admin" | "agent";

/** Routes restricted to admins. Anything not in this set is open to all
 *  signed-in users. */
const ADMIN_ONLY_ROUTES: readonly string[] = ["/agents", "/audit-log", "/reports"];

export function canAccessRoute(role: AppRole | null | undefined, path: string): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  return !ADMIN_ONLY_ROUTES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Admin-only actions on defects/users. */
export function canPerformAdminAction(
  role: AppRole | null | undefined,
  action:
    | "change_user_role"
    | "deactivate_user"
    | "delete_defect"
    | "validate_defect"
    | "assign_task"
    | "view_all_audit_log",
): boolean {
  if (role !== "admin") return false;
  void action;
  return true;
}

/** Whether the user may export the global org-wide dataset (vs. just their
 *  own reported errors). Agents can export their own reports only. */
export function canExport(role: AppRole | null | undefined, scope: "own" | "org"): boolean {
  if (!role) return false;
  if (scope === "own") return true;
  return role === "admin";
}
