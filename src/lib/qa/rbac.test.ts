import { describe, it, expect } from "vitest";
import { canAccessRoute, canExport, canPerformAdminAction, scopeForUser } from "./scope";

describe("RBAC: canAccessRoute", () => {
  const adminOnly = ["/agents", "/audit-log", "/reports"];
  const sharedRoutes = [
    "/dashboard",
    "/my-reported-errors",
    "/my-errors",
    "/retest",
    "/notifications",
    "/settings",
    "/forms",
    "/2290-forms",
  ];

  it.each(adminOnly)("denies agent access to %s", (path) => {
    expect(canAccessRoute("agent", path)).toBe(false);
    expect(canAccessRoute("admin", path)).toBe(true);
  });

  it.each(sharedRoutes)("allows both roles on %s", (path) => {
    expect(canAccessRoute("agent", path)).toBe(true);
    expect(canAccessRoute("admin", path)).toBe(true);
  });

  it("denies anyone with no role", () => {
    expect(canAccessRoute(null, "/dashboard")).toBe(false);
    expect(canAccessRoute(undefined, "/agents")).toBe(false);
  });

  it("matches nested admin paths (e.g. /agents/<id>)", () => {
    expect(canAccessRoute("agent", "/agents/abc-123")).toBe(false);
    expect(canAccessRoute("admin", "/agents/abc-123")).toBe(true);
  });
});

describe("RBAC: canPerformAdminAction", () => {
  const actions = [
    "change_user_role",
    "deactivate_user",
    "delete_defect",
    "validate_defect",
    "assign_task",
    "view_all_audit_log",
  ] as const;

  it.each(actions)("admin can %s; agent cannot", (a) => {
    expect(canPerformAdminAction("admin", a)).toBe(true);
    expect(canPerformAdminAction("agent", a)).toBe(false);
    expect(canPerformAdminAction(null, a)).toBe(false);
  });
});

describe("RBAC: canExport", () => {
  it("agents can export their own scope but not org-wide", () => {
    expect(canExport("agent", "own")).toBe(true);
    expect(canExport("agent", "org")).toBe(false);
  });
  it("admins can export anything", () => {
    expect(canExport("admin", "own")).toBe(true);
    expect(canExport("admin", "org")).toBe(true);
  });
  it("nobody if no role", () => {
    expect(canExport(null, "own")).toBe(false);
    expect(canExport(null, "org")).toBe(false);
  });
});

describe("RBAC: scopeForUser data filtering", () => {
  const rows = [
    { createdBy: "Alice", assignedAgent: "Alice" },
    { createdBy: "Alice", assignedAgent: "Bob" },
    { createdBy: "Bob", assignedAgent: "Alice" },
  ];

  it("admin sees everything", () => {
    expect(scopeForUser(rows, { name: "Alice", role: "admin" })).toHaveLength(3);
  });

  it("agent only sees rows they created", () => {
    const visible = scopeForUser(rows, { name: "Alice", role: "agent" });
    expect(visible).toHaveLength(2);
    expect(visible.every((r) => r.createdBy === "Alice")).toBe(true);
  });

  it("no user → empty", () => {
    expect(scopeForUser(rows, null)).toEqual([]);
  });
});
