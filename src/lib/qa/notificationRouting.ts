import type { NotificationItem } from "./store";

/** Try to extract a retest assignment id like `RT-12345-abcd` from a notification title/body. */
export function extractAssignmentId(n: Pick<NotificationItem, "title" | "body">): string | null {
  const text = `${n.title ?? ""} ${n.body ?? ""}`;
  const m = text.match(/RT-\d+-[a-z0-9]+/i);
  return m ? m[0] : null;
}

/** Resolve a navigation target for a notification (route + search). */
export function routeForNotification(
  n: Pick<NotificationItem, "type" | "title" | "body" | "defectId">,
): { to: string; search?: Record<string, string> } {
  // Retest assignment notifications point at the Task Assignments page,
  // pre-focused on the relevant assignment when possible.
  if (n.type?.startsWith("retest_")) {
    const id = extractAssignmentId(n);
    return { to: "/retest", search: id ? { assignment: id } : undefined };
  }
  // Role-change goes to settings/profile area
  if (n.type === "role_change") return { to: "/profile" };
  // Defect-related → reported errors, focused on the defect id
  if (n.defectId) return { to: "/my-reported-errors", search: { q: n.defectId } };
  return { to: "/notifications" };
}

/**
 * Self-exclusion rule mirroring the DB triggers
 * (notify_defect_changes / notify_defect_comment / notify_retest_changes):
 * a user must never receive a notification triggered by their own action.
 *
 * `actor` is the user who performed the action; `recipient` is the
 * candidate notification target. Returns false when they're the same
 * person, or when either is missing.
 */
export function shouldNotify(
  actor: string | null | undefined,
  recipient: string | null | undefined,
): boolean {
  if (!actor || !recipient) return false;
  return actor !== recipient;
}
