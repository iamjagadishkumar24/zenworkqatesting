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
// 2290-related entries (e.g. "Form 2290", "EZ2290", "2290.us", "GT2290") and
// the retired "Form 1099 Corrections" entry never appear outside the dedicated
// 2290 Forms module.
export function isTwoTwoNinetyName(name: string): boolean {
  return /(^|\b)(2290|ez2290|gt2290)\b/i.test(name);
}

export function excludeNonCatalogForms(names: string[]): string[] {
  return names.filter((n) => !isTwoTwoNinetyName(n) && !/1099\s+corrections/i.test(n));
}