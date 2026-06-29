import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  recordAuditFailure,
  getAuditFailureSnapshot,
  clearAuditFailures,
  subscribeToAuditFailures,
  trackAuditResult,
  trackAuditPromise,
} from "./auditFailures";

describe("auditFailures tracker", () => {
  beforeEach(() => {
    clearAuditFailures();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("records failures and increments per-scope counters", () => {
    recordAuditFailure("activity_log", new Error("boom"));
    recordAuditFailure("activity_log", "later");
    recordAuditFailure("agent_audit_log", { code: 23505 });
    const snap = getAuditFailureSnapshot();
    expect(snap.totalCount).toBe(3);
    expect(snap.perScope.activity_log).toBe(2);
    expect(snap.perScope.agent_audit_log).toBe(1);
    expect(snap.recent[0].scope).toBe("agent_audit_log");
    expect(snap.recent.at(-1)?.message).toBe("boom");
    expect(snap.lastAt).not.toBeNull();
  });

  it("notifies subscribers and supports clearing", () => {
    const seen: number[] = [];
    const unsub = subscribeToAuditFailures((s) => seen.push(s.totalCount));
    recordAuditFailure("auth_attempt", "x");
    recordAuditFailure("auth_attempt", "y");
    clearAuditFailures();
    unsub();
    expect(seen).toEqual([1, 2, 0]);
    expect(getAuditFailureSnapshot().totalCount).toBe(0);
  });

  it("trackAuditResult records when server flag is set", () => {
    const ok = trackAuditResult("auth_attempt", { ok: true, auditWriteFailed: false });
    expect(getAuditFailureSnapshot().totalCount).toBe(0);
    expect(ok).toEqual({ ok: true, auditWriteFailed: false });
    trackAuditResult("auth_attempt", {
      ok: true,
      auditWriteFailed: true,
      auditWriteError: "insert denied",
    });
    const snap = getAuditFailureSnapshot();
    expect(snap.totalCount).toBe(1);
    expect(snap.recent[0].message).toBe("insert denied");
    expect(snap.perScope.auth_attempt).toBe(1);
  });

  it("trackAuditPromise records failures from rejected promises", async () => {
    trackAuditPromise("activity_log", Promise.reject(new Error("network")));
    await new Promise((r) => setTimeout(r, 0));
    const snap = getAuditFailureSnapshot();
    expect(snap.totalCount).toBe(1);
    expect(snap.recent[0].message).toBe("network");
  });

  it("trims recent list to a bounded size", () => {
    for (let i = 0; i < 30; i++) recordAuditFailure("other", `err-${i}`);
    const snap = getAuditFailureSnapshot();
    expect(snap.totalCount).toBe(30);
    expect(snap.recent.length).toBeLessThanOrEqual(20);
    expect(snap.recent[0].message).toBe("err-29");
  });
});