import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Additional end-to-end coverage for the unified activity_log:
 *   1. Admin-driven events — exports, role changes, agent permission
 *      changes — are recorded with correct category/action and the
 *      expected old/new value diffs.
 *   2. Auth failures (bad password, account locked) are persisted via
 *      `recordAuthEvent` with result=failure and the right reason
 *      metadata, and reach realtime subscribers without a refresh.
 *   3. The "Today" / custom date-range filter used by the audit log UI
 *      handles timezone offsets correctly — UTC rows that fall inside
 *      the local day are kept, rows on neighbouring local days are not.
 */

// ---------- types & helpers --------------------------------------------------

type ActivityRow = {
  id: string;
  occurred_at: string; // ISO UTC
  category: string;
  action: string;
  record_id: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  result: "success" | "failure";
  summary: string;
  metadata: Record<string, unknown> | null;
};

function makeSink() {
  const rows: ActivityRow[] = [];
  const subs: ((r: ActivityRow) => void)[] = [];
  let seq = 0;
  return {
    rows,
    insert(partial: Omit<ActivityRow, "id">) {
      const row: ActivityRow = { id: `act-${++seq}`, ...partial };
      rows.push(row);
      for (const cb of subs) cb(row);
      return row;
    },
    subscribe(cb: (r: ActivityRow) => void) {
      subs.push(cb);
      return () => {
        const i = subs.indexOf(cb);
        if (i >= 0) subs.splice(i, 1);
      };
    },
  };
}
type Sink = ReturnType<typeof makeSink>;

// Mirrors activity_export_trg in the database.
function exportTrigger(
  sink: Sink,
  job: {
    id: string;
    scope: string;
    environment: string;
    status: string;
    row_count: number;
    file_name: string;
    requested_by_id: string;
    requested_by_name: string;
    filters: Record<string, unknown>;
  },
) {
  sink.insert({
    occurred_at: new Date().toISOString(),
    category: "export",
    action: `export.${job.status}`,
    record_id: job.id,
    actor_id: job.requested_by_id,
    actor_name: job.requested_by_name,
    actor_role: "admin",
    old_value: null,
    new_value: {
      scope: job.scope,
      status: job.status,
      rows: job.row_count,
      file: job.file_name,
    },
    result: job.status === "failed" ? "failure" : "success",
    summary: `${job.requested_by_name} exported ${job.scope} (${job.environment})`,
    metadata: job.filters,
  });
}

// Mirrors activity_role_trg.
function roleTrigger(
  sink: Sink,
  ev: {
    target_user_id: string;
    target_name: string;
    old_role: string | null;
    new_role: string;
    changed_by_id: string;
    changed_by_name: string;
  },
) {
  sink.insert({
    occurred_at: new Date().toISOString(),
    category: "role",
    action: "role.changed",
    record_id: ev.target_user_id,
    actor_id: ev.changed_by_id,
    actor_name: ev.changed_by_name,
    actor_role: "admin",
    old_value: { role: ev.old_role },
    new_value: { role: ev.new_role },
    result: "success",
    summary: `${ev.changed_by_name} changed role of ${ev.target_name} from ${ev.old_role ?? "—"} to ${ev.new_role}`,
    metadata: null,
  });
}

// Mirrors activity_agent_trg (agent invites / permission changes).
function agentTrigger(
  sink: Sink,
  ev: {
    target_email: string;
    action: string;
    performed_by_id: string;
    performed_by_name: string;
    details: Record<string, unknown>;
  },
) {
  sink.insert({
    occurred_at: new Date().toISOString(),
    category: "user_mgmt",
    action: `user.${ev.action}`,
    record_id: ev.target_email,
    actor_id: ev.performed_by_id,
    actor_name: ev.performed_by_name,
    actor_role: "admin",
    old_value: null,
    new_value: ev.details,
    result: "success",
    summary: `${ev.performed_by_name} performed ${ev.action} on ${ev.target_email}`,
    metadata: ev.details,
  });
}

// ---------- admin export / role / permission events --------------------------

describe("activity_log: admin exports record scope, filters, and row counts", () => {
  it("export.completed carries scope, row count, and applied filters", () => {
    const sink = makeSink();
    exportTrigger(sink, {
      id: "exp-1",
      scope: "defects",
      environment: "Production",
      status: "completed",
      row_count: 124,
      file_name: "defects-2026.xlsx",
      requested_by_id: "u-admin",
      requested_by_name: "Portal Admin",
      filters: { tax_year: "2026", status: ["Open", "Reported"] },
    });
    const r = sink.rows[0]!;
    expect(r.category).toBe("export");
    expect(r.action).toBe("export.completed");
    expect(r.result).toBe("success");
    expect(r.new_value).toMatchObject({ scope: "defects", rows: 124, file: "defects-2026.xlsx" });
    expect(r.metadata).toEqual({ tax_year: "2026", status: ["Open", "Reported"] });
    expect(r.actor_role).toBe("admin");
  });

  it("export.failed maps to result=failure so it surfaces in the failures tile", () => {
    const sink = makeSink();
    exportTrigger(sink, {
      id: "exp-2",
      scope: "reports",
      environment: "Production",
      status: "failed",
      row_count: 0,
      file_name: "",
      requested_by_id: "u-admin",
      requested_by_name: "Portal Admin",
      filters: { tax_year: "2026" },
    });
    expect(sink.rows[0]!.result).toBe("failure");
    expect(sink.rows[0]!.action).toBe("export.failed");
  });
});

describe("activity_log: role assignment diffs", () => {
  it("captures previous and new role in old_value/new_value", () => {
    const sink = makeSink();
    roleTrigger(sink, {
      target_user_id: "u-bob",
      target_name: "Bob",
      old_role: "agent",
      new_role: "admin",
      changed_by_id: "u-admin",
      changed_by_name: "Portal Admin",
    });
    const r = sink.rows[0]!;
    expect(r.action).toBe("role.changed");
    expect(r.old_value).toEqual({ role: "agent" });
    expect(r.new_value).toEqual({ role: "admin" });
    expect(r.summary).toContain("Bob");
    expect(r.summary).toContain("admin");
    expect(r.actor_name).toBe("Portal Admin");
  });

  it("first-time role grant has old_value.role = null", () => {
    const sink = makeSink();
    roleTrigger(sink, {
      target_user_id: "u-new",
      target_name: "Newcomer",
      old_role: null,
      new_role: "agent",
      changed_by_id: "u-admin",
      changed_by_name: "Portal Admin",
    });
    expect(sink.rows[0]!.old_value).toEqual({ role: null });
    expect(sink.rows[0]!.new_value).toEqual({ role: "agent" });
  });
});

describe("activity_log: agent permission changes", () => {
  it("invite/activate/deactivate flow records each user.* action with details", () => {
    const sink = makeSink();
    agentTrigger(sink, {
      target_email: "agent@qaportal.app",
      action: "invite_created",
      performed_by_id: "u-admin",
      performed_by_name: "Portal Admin",
      details: { name: "QA Agent", role: "agent" },
    });
    agentTrigger(sink, {
      target_email: "agent@qaportal.app",
      action: "deactivated",
      performed_by_id: "u-admin",
      performed_by_name: "Portal Admin",
      details: { reason: "left team" },
    });
    expect(sink.rows.map((r) => r.action)).toEqual(["user.invite_created", "user.deactivated"]);
    expect(sink.rows[0]!.metadata).toEqual({ name: "QA Agent", role: "agent" });
    expect(sink.rows[1]!.metadata).toEqual({ reason: "left team" });
    for (const r of sink.rows) expect(r.category).toBe("user_mgmt");
  });
});

// ---------- failed login + lockout ------------------------------------------

describe("recordAuthEvent: failed logins and lockout events", () => {
  beforeEach(() => vi.resetModules());

  type RpcCall = (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: null; error: null }>;

  it("invalid password → auth.login with result=failure and reason metadata", async () => {
    const rpc = vi.fn<RpcCall>(async () => ({ data: null, error: null }));
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
    const { recordAuthEvent } = await import("./activityLog");
    await recordAuthEvent({
      kind: "login",
      email: "admin@qaportal.app",
      success: false,
      reason: "invalid_credentials",
    });
    const args = rpc.mock.calls[0]![1];
    expect(args._category).toBe("auth");
    expect(args._action).toBe("auth.login");
    expect(args._result).toBe("failure");
    expect(args._metadata).toEqual({ reason: "invalid_credentials" });
  });

  it("account locked event carries lockout metadata (attempts, until)", async () => {
    const rpc = vi.fn<RpcCall>(async () => ({ data: null, error: null }));
    vi.doMock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
    const { recordAuthEvent } = await import("./activityLog");
    const until = new Date(Date.now() + 15 * 60_000).toISOString();
    await recordAuthEvent({
      kind: "login",
      email: "agent@qaportal.app",
      success: false,
      metadata: { reason: "account_locked", failed_attempts: 5, locked_until: until },
    });
    const args = rpc.mock.calls[0]![1];
    expect(args._result).toBe("failure");
    expect(args._metadata).toMatchObject({
      reason: "account_locked",
      failed_attempts: 5,
      locked_until: until,
    });
  });
});

describe("failed-login events reach realtime subscribers without refresh", () => {
  it("fan-out delivers failure rows with correct action/result", () => {
    const sink = makeSink();
    const received: ActivityRow[] = [];
    sink.subscribe((r) => received.push(r));
    sink.insert({
      occurred_at: new Date().toISOString(),
      category: "auth",
      action: "auth.login",
      record_id: "x@y.z",
      actor_id: null,
      actor_name: "x@y.z",
      actor_role: null,
      old_value: null,
      new_value: null,
      result: "failure",
      summary: "x@y.z failed sign-in",
      metadata: { reason: "invalid_credentials" },
    });
    sink.insert({
      occurred_at: new Date().toISOString(),
      category: "auth",
      action: "auth.login",
      record_id: "x@y.z",
      actor_id: null,
      actor_name: "x@y.z",
      actor_role: null,
      old_value: null,
      new_value: null,
      result: "failure",
      summary: "x@y.z locked out",
      metadata: { reason: "account_locked", failed_attempts: 5 },
    });
    expect(received).toHaveLength(2);
    expect(received.every((r) => r.result === "failure")).toBe(true);
    expect(received[1]!.metadata).toMatchObject({ reason: "account_locked" });
  });
});

// ---------- date-range filter & timezone handling ---------------------------

/** Mirrors the audit log UI: range is interpreted in the viewer's local TZ,
 * but `occurred_at` is stored as UTC. A row matches when its UTC instant
 * falls inside the local-day window [start, end). */
function inRange(occurredAtIso: string, startLocal: Date, endLocal: Date) {
  const t = new Date(occurredAtIso).getTime();
  return t >= startLocal.getTime() && t < endLocal.getTime();
}
function localDayBounds(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

describe("audit log: Today vs custom range filter (timezone aware)", () => {
  it("Today keeps rows whose UTC instant falls inside the local day", () => {
    const noonLocal = new Date(2026, 5, 18, 12, 0, 0); // Jun 18, 2026 12:00 local
    const { start, end } = localDayBounds(noonLocal);

    // Built from local-time anchors so the assertions are TZ-independent.
    const inside = new Date(2026, 5, 18, 9, 30, 0).toISOString();
    const alsoInside = new Date(2026, 5, 18, 23, 59, 0).toISOString();
    const yesterday = new Date(2026, 5, 17, 23, 59, 0).toISOString();
    const tomorrow = new Date(2026, 5, 19, 0, 1, 0).toISOString();

    expect(inRange(inside, start, end)).toBe(true);
    expect(inRange(alsoInside, start, end)).toBe(true);
    expect(inRange(yesterday, start, end)).toBe(false);
    expect(inRange(tomorrow, start, end)).toBe(false);
  });

  it("end of range is exclusive — midnight of next day is excluded", () => {
    const { start, end } = localDayBounds(new Date(2026, 5, 18, 10));
    const midnightNext = new Date(2026, 5, 19, 0, 0, 0).toISOString();
    expect(inRange(midnightNext, start, end)).toBe(false);
  });

  it("custom multi-day range includes both endpoints' local days", () => {
    const start = localDayBounds(new Date(2026, 5, 15)).start;
    const end = localDayBounds(new Date(2026, 5, 17)).end; // exclusive
    const rows = [
      new Date(2026, 5, 14, 23, 59).toISOString(), // before
      new Date(2026, 5, 15, 0, 0).toISOString(), // first day start
      new Date(2026, 5, 16, 12, 0).toISOString(), // middle
      new Date(2026, 5, 17, 23, 59).toISOString(), // last day end
      new Date(2026, 5, 18, 0, 0).toISOString(), // after
    ];
    const kept = rows.filter((iso) => inRange(iso, start, end));
    expect(kept).toHaveLength(3);
  });

  it("a UTC timestamp that is 'tomorrow' in UTC but 'today' locally is kept", () => {
    // 2026-06-18 23:30 in a UTC+5 zone is 2026-06-19 04:30 UTC. Building from
    // local components mirrors the UI's Date inputs, so this row sits inside
    // the local day's window regardless of the runner's timezone.
    const localLateEvening = new Date(2026, 5, 18, 23, 30, 0);
    const { start, end } = localDayBounds(new Date(2026, 5, 18, 10));
    expect(inRange(localLateEvening.toISOString(), start, end)).toBe(true);
  });
});
