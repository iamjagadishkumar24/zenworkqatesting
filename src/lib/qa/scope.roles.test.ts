import { describe, it, expect } from "vitest";
import {
  canAccessRoute,
  canExport,
  canPerformAdminAction,
  excludeNonCatalogForms,
  isTwoTwoNinetyName,
} from "./scope";

describe("canAccessRoute", () => {
  it("admins can access every route", () => {
    expect(canAccessRoute("admin", "/agents")).toBe(true);
    expect(canAccessRoute("admin", "/audit-log")).toBe(true);
    expect(canAccessRoute("admin", "/reports")).toBe(true);
    expect(canAccessRoute("admin", "/dashboard")).toBe(true);
  });
  it("agents cannot access admin-only routes or their subpaths", () => {
    for (const path of ["/agents", "/audit-log", "/reports", "/reports/exports"]) {
      expect(canAccessRoute("agent", path)).toBe(false);
    }
  });
  it("agents can access non-admin routes", () => {
    expect(canAccessRoute("agent", "/dashboard")).toBe(true);
    expect(canAccessRoute("agent", "/my-reported-errors")).toBe(true);
  });
  it("missing role denies every route", () => {
    expect(canAccessRoute(null, "/dashboard")).toBe(false);
    expect(canAccessRoute(undefined, "/agents")).toBe(false);
  });
  it("does not block routes that merely share a prefix without a path boundary", () => {
    // "/reportsplus" is not under "/reports"
    expect(canAccessRoute("agent", "/reportsplus")).toBe(true);
  });
});

describe("canPerformAdminAction", () => {
  it("admins may perform every admin action", () => {
    for (const a of [
      "change_user_role",
      "deactivate_user",
      "delete_defect",
      "validate_defect",
      "assign_task",
      "view_all_audit_log",
    ] as const) {
      expect(canPerformAdminAction("admin", a)).toBe(true);
    }
  });
  it("agents and unauthenticated users never may", () => {
    expect(canPerformAdminAction("agent", "delete_defect")).toBe(false);
    expect(canPerformAdminAction(null, "assign_task")).toBe(false);
    expect(canPerformAdminAction(undefined, "validate_defect")).toBe(false);
  });
});

describe("canExport", () => {
  it("'own' scope is allowed for every signed-in role", () => {
    expect(canExport("agent", "own")).toBe(true);
    expect(canExport("admin", "own")).toBe(true);
  });
  it("'org' scope is admin-only", () => {
    expect(canExport("admin", "org")).toBe(true);
    expect(canExport("agent", "org")).toBe(false);
  });
  it("unauthenticated users cannot export at all", () => {
    expect(canExport(null, "own")).toBe(false);
    expect(canExport(null, "org")).toBe(false);
  });
});

describe("2290 catalog exclusion", () => {
  it("isTwoTwoNinetyName flags 2290 / EZ2290 / GT2290 entries", () => {
    expect(isTwoTwoNinetyName("Form 2290")).toBe(true);
    expect(isTwoTwoNinetyName("EZ2290")).toBe(true);
    expect(isTwoTwoNinetyName("GT2290")).toBe(true);
    expect(isTwoTwoNinetyName("ez2290")).toBe(true);
  });
  it("does not flag unrelated forms", () => {
    expect(isTwoTwoNinetyName("Form 1099-NEC")).toBe(false);
    expect(isTwoTwoNinetyName("Form 22900")).toBe(false); // word boundary
  });
  it("excludeNonCatalogForms strips every 2290-flavoured name", () => {
    expect(
      excludeNonCatalogForms(["Form 1099-NEC", "EZ2290", "Form 2290", "Form W-2", "GT2290"]),
    ).toEqual(["Form 1099-NEC", "Form W-2"]);
  });
});
