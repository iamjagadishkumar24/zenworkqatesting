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