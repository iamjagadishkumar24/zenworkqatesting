import { describe, it, expect } from "vitest";
import { extractAssignmentId, routeForNotification, shouldNotify } from "./notificationRouting";
import type { NotificationItem } from "./store";

function mkNote(over: Partial<NotificationItem>): NotificationItem {
  return {
    id: "n1",
    title: "",
    body: "",
    createdAt: "",
    read: false,
    ...over,
  } as NotificationItem;
}

describe("extractAssignmentId", () => {
  it("extracts an RT-id from the title", () => {
    expect(extractAssignmentId({ title: "New task RT-12-abcd", body: "" })).toBe("RT-12-abcd");
  });
  it("extracts an RT-id from the body when title is empty", () => {
    expect(extractAssignmentId({ title: null as never, body: "see RT-7-x9" })).toBe("RT-7-x9");
  });
  it("is case-insensitive on the prefix", () => {
    expect(extractAssignmentId({ title: "", body: "rt-1-ab" })).toBe("rt-1-ab");
  });
  it("returns null when no id is present", () => {
    expect(extractAssignmentId({ title: "hello", body: "world" })).toBeNull();
  });
});

describe("routeForNotification", () => {
  it("routes retest_* to /retest pre-focused on the assignment id", () => {
    const r = routeForNotification(
      mkNote({ type: "retest_assigned", title: "Task RT-9-aa", body: "" }),
    );
    expect(r.to).toBe("/retest");
    expect(r.search).toEqual({ assignment: "RT-9-aa" });
  });
  it("retest_* without an id still routes to /retest with no search", () => {
    const r = routeForNotification(mkNote({ type: "retest_assigned", title: "Task", body: "" }));
    expect(r.to).toBe("/retest");
    expect(r.search).toBeUndefined();
  });
  it("role_change routes to /profile", () => {
    expect(routeForNotification(mkNote({ type: "role_change" })).to).toBe("/profile");
  });
  it("defect-related notifications focus the my-reported-errors search", () => {
    const r = routeForNotification(mkNote({ type: "defect_assigned", defectId: "ZEN-1" }));
    expect(r).toEqual({ to: "/my-reported-errors", search: { q: "ZEN-1" } });
  });
  it("falls back to /notifications when nothing matches", () => {
    expect(routeForNotification(mkNote({ type: "system" })).to).toBe("/notifications");
  });
});

describe("shouldNotify self-exclusion", () => {
  it("blocks notifying the actor themselves", () => {
    expect(shouldNotify("u1", "u1")).toBe(false);
  });
  it("allows notifying a different recipient", () => {
    expect(shouldNotify("u1", "u2")).toBe(true);
  });
  it("returns false when either side is missing", () => {
    expect(shouldNotify(null, "u1")).toBe(false);
    expect(shouldNotify("u1", null)).toBe(false);
    expect(shouldNotify(undefined, undefined)).toBe(false);
  });
});
