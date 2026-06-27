import { describe, it, expect } from "vitest";

// Mirrors the predicate used in AppShell.tsx for the leaf-link active state
// (lines ~252 / ~307): path === item.to || path.startsWith(item.to + "/").
function isItemActive(path: string, to: string): boolean {
  return path === to || path.startsWith(to + "/");
}

const REPORTS_GROUP_ITEMS = [
  "/my-reported-errors",
  "/reports",
  "/reports/performance",
  "/reports/user",
  "/reports/activity",
  "/reports/analytics",
  "/reports/audit",
  "/reports/scheduled",
  "/reports/export-center",
];

describe("Reports sidebar active highlighting", () => {
  it("highlights only the Reported Errors leaf on /my-reported-errors", () => {
    const path = "/my-reported-errors";
    const active = REPORTS_GROUP_ITEMS.filter((to) => isItemActive(path, to));
    expect(active).toEqual(["/my-reported-errors"]);
  });

  it("preserves the leaf match for nested URLs under /my-reported-errors", () => {
    const path = "/my-reported-errors/123";
    const active = REPORTS_GROUP_ITEMS.filter((to) => isItemActive(path, to));
    expect(active).toEqual(["/my-reported-errors"]);
  });

  it("does not highlight Reported Errors when on a sibling Reports page", () => {
    for (const path of [
      "/reports",
      "/reports/performance",
      "/reports/audit",
      "/reports/export-center",
    ]) {
      expect(isItemActive(path, "/my-reported-errors")).toBe(false);
    }
  });

  it("does not treat URL prefixes that aren't path segments as active", () => {
    expect(isItemActive("/my-reported-errors-archive", "/my-reported-errors")).toBe(false);
    expect(isItemActive("/reports-legacy", "/reports")).toBe(false);
  });

  it("parent Reports row is not a leaf entry (no /reports-group link)", () => {
    expect(REPORTS_GROUP_ITEMS).not.toContain("/reports-group");
  });
});
