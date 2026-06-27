/**
 * Extract a short display name (first name) for the dashboard header chip.
 *
 * Scope: header-only. Full name continues to be displayed everywhere else
 * (profile, admin, reports, audit log, notifications, emails, DB, API).
 *
 * Handles: single-word names, multiple/irregular spaces, hyphenated names
 * ("Mary-Jane Watson" → "Mary-Jane"), names with punctuation, and missing
 * values (falls back to the local-part of the email, then a generic label).
 */
export function getFirstName(
  fullName?: string | null,
  email?: string | null,
  fallback: string = "Account",
): string {
  const name = (fullName ?? "").replace(/\s+/g, " ").trim();
  if (name.length > 0) {
    const first = name.split(" ")[0];
    if (first) return first;
  }
  const mail = (email ?? "").trim();
  if (mail.length > 0) {
    const local = mail.split("@")[0] ?? "";
    if (local) return local;
  }
  return fallback;
}