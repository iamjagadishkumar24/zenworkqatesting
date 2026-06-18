import { describe, it, expect } from "vitest";
import { shouldNotify, routeForNotification, extractAssignmentId } from "./notificationRouting";

describe("notification self-exclusion (shouldNotify)", () => {
  it("returns false when actor is the recipient (self-action)", () => {
    expect(shouldNotify("u1", "u1")).toBe(false);
  });
  it("returns true when actor and recipient differ", () => {
    expect(shouldNotify("admin-uid", "agent-uid")).toBe(true);
  });
  it("returns false when actor or recipient is missing", () => {
    expect(shouldNotify(null, "u1")).toBe(false);
    expect(shouldNotify("u1", null)).toBe(false);
    expect(shouldNotify(undefined, undefined)).toBe(false);
    expect(shouldNotify("", "u1")).toBe(false);
  });
});

describe("routeForNotification", () => {
  it("retest notifications route to /retest with assignment id when present", () => {
    const r = routeForNotification({
      type: "retest_assigned",
      title: "Retest task assigned: RT-1733-abcd",
      body: "",
      defectId: null,
    });
    expect(r.to).toBe("/retest");
    expect(r.search?.assignment).toBe("RT-1733-abcd");
  });
  it("defect notifications route to /my-reported-errors with q=defectId", () => {
    expect(
      routeForNotification({ type: "status", title: "", body: "", defectId: "ZEN-2025-01" }),
    ).toEqual({ to: "/my-reported-errors", search: { q: "ZEN-2025-01" } });
  });
  it("role_change goes to /settings", () => {
    expect(routeForNotification({ type: "role_change", title: "", body: "", defectId: null }).to)
      .toBe("/settings");
  });
  it("fallback is /notifications", () => {
    expect(routeForNotification({ type: "misc", title: "", body: "", defectId: null }).to)
      .toBe("/notifications");
  });
  it("extractAssignmentId handles missing matches", () => {
    expect(extractAssignmentId({ title: "no id here", body: "" })).toBeNull();
  });
});