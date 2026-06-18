import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * End-to-end style tests for the unified `activity_log` pipeline.
 *
 * These tests mirror the behaviour of the Postgres triggers
 * (`activity_defects_trg`, `activity_retest_trg`) and the realtime
 * fan-out so we can verify, without standing up a live database:
 *
 *   1. Events are produced for every meaningful change.
 *   2. `old_value` / `new_value` payloads carry accurate before/after
 *      snapshots for both defects and tasks.
 *   3. A realtime subscriber sees new rows immediately (no refresh).
 *   4. The `recordAuthEvent` helper invokes the `log_activity` RPC with
 *      the correct category/action shape.
 */

type ActivityRow = {
  id: string;
  category: string;
  action: string;
  record_id: string;
  defect_id?: string | null;
  task_id?: string | null;
  actor_name: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  summary: string;
  occurred_at: string;
};

// ----- trigger simulation helpers -------------------------------------------

type Defect = {
  id: string;
  title: string;
  status: string;
  priority: string;
  severity: string;
  validity: string;
  assigned_agent: string | null;
  environment: string;
  form_name: string;
  tax_year: string;
  created_by: string;
  updated_by: string;
};

type Task = {
  id: string;
  status: string;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  assigned_by_id: string;
  assigned_by_name: string;
  environment: string;
  tax_year: string;
};

function makeSink() {
  const rows: ActivityRow[] = [];
  const subs: ((r: ActivityRow) => void)[] = [];
  let seq = 0;
  function insert(partial: Omit<ActivityRow, "id" | "occurred_at">) {
    const row: ActivityRow = {
      id: `act-${++seq}`,
      occurred_at: new Date(2026, 5, 18, 10, 0, seq).toISOString(),
      ...partial,
    };
    rows.push(row);
    for (const cb of subs) cb(row); // realtime fan-out
    return row;
  }
  function subscribe(cb: (r: ActivityRow) => void) {
    subs.push(cb);
    return () => {
      const i = subs.indexOf(cb);
      if (i >= 0) subs.splice(i, 1);
    };
  }
  return { rows, insert, subscribe };
}

type Sink = ReturnType<typeof makeSink>;

function defectInsertTrigger(sink: Sink, n: Defect) {
  sink.insert({
    category: "defect",
    action: "defect.created",
    record_id: n.id,
    defect_id: n.id,
    actor_name: n.created_by,
    old_value: null,
    new_value: { ...n },
    summary: `${n.created_by} created defect ${n.id}`,
  });
}

function defectUpdateTrigger(sink: Sink, o: Defect, n: Defect) {
  const actor = n.updated_by;
  const emit = (
    action: string,
    oldV: Record<string, unknown>,
    newV: Record<string, unknown>,
    summary: string,
  ) =>
    sink.insert({
      category: "defect",
      action,
      record_id: n.id,
      defect_id: n.id,
      actor_name: actor,
      old_value: oldV,
      new_value: newV,
      summary,
    });
  if (o.status !== n.status) {
    const action =
      n.status === "Closed"
        ? "defect.closed"
        : (o.status === "Closed" || o.status === "Fixed") &&
          ["Reported", "Open", "In Progress"].includes(n.status)
          ? "defect.reopened"
          : "defect.status_changed";
    emit(action, { status: o.status }, { status: n.status },
      `${actor} changed status of ${n.id} from ${o.status} to ${n.status}`);
  }
  if (o.assigned_agent !== n.assigned_agent) {
    emit(o.assigned_agent == null ? "defect.assigned" : "defect.reassigned",
      { assigned_agent: o.assigned_agent }, { assigned_agent: n.assigned_agent },
      `${actor} assigned ${n.id} to ${n.assigned_agent ?? "—"}`);
  }
  if (o.priority !== n.priority) {
    emit("defect.priority_changed", { priority: o.priority }, { priority: n.priority },
      `${actor} changed priority of ${n.id} to ${n.priority}`);
  }
  if (o.severity !== n.severity) {
    emit("defect.severity_changed", { severity: o.severity }, { severity: n.severity },
      `${actor} changed severity of ${n.id} to ${n.severity}`);
  }
  if (o.validity !== n.validity) {
    emit("defect.validity_changed", { validity: o.validity }, { validity: n.validity },
      `${actor} marked ${n.id} as ${n.validity}`);
  }
}

function taskInsertTrigger(sink: Sink, t: Task) {
  sink.insert({
    category: "task",
    action: "task.created",
    record_id: t.id,
    task_id: t.id,
    actor_name: t.assigned_by_name,
    old_value: null,
    new_value: { ...t },
    summary: `${t.assigned_by_name} created task ${t.id}`,
  });
  if (t.assigned_agent_id) {
    sink.insert({
      category: "task",
      action: "task.assigned",
      record_id: t.id,
      task_id: t.id,
      actor_name: t.assigned_by_name,
      old_value: null,
      new_value: { assigned_to: t.assigned_agent_name },
      summary: `${t.assigned_by_name} assigned task ${t.id} to ${t.assigned_agent_name}`,
    });
  }
}

function taskUpdateTrigger(sink: Sink, o: Task, n: Task) {
  if (o.assigned_agent_id !== n.assigned_agent_id) {
    sink.insert({
      category: "task",
      action: "task.reassigned",
      record_id: n.id,
      task_id: n.id,
      actor_name: n.assigned_by_name,
      old_value: { assigned_to: o.assigned_agent_name },
      new_value: { assigned_to: n.assigned_agent_name },
      summary: `Task ${n.id} reassigned to ${n.assigned_agent_name ?? "—"}`,
    });
  }
  if (o.status !== n.status) {
    const action =
      n.status === "Completed" ? "task.completed" :
      n.status === "Pending" ? "task.reopened" : "task.status_changed";
    sink.insert({
      category: "task",
      action,
      record_id: n.id,
      task_id: n.id,
      actor_name: n.assigned_agent_name,
      old_value: { status: o.status },
      new_value: { status: n.status },
      summary: `Task ${n.id} → ${n.status}`,
    });
  }
}

// ----- tests ----------------------------------------------------------------

describe("activity_log: defect lifecycle produces accurate before/after values", () => {
  let sink: Sink;
  const base: Defect = {
    id: "ZEN-2026-01",
    title: "Totals off by one",
    status: "Reported",
    priority: "Medium",
    severity: "Major",
    validity: "Unverified",
    assigned_agent: null,
    environment: "Production",
    form_name: "1040",
    tax_year: "2026",
    created_by: "Alice",
    updated_by: "Alice",
  };
  beforeEach(() => { sink = makeSink(); });

  it("emits defect.created with full snapshot in new_value", () => {
    defectInsertTrigger(sink, base);
    expect(sink.rows).toHaveLength(1);
    const r = sink.rows[0];
    expect(r.action).toBe("defect.created");
    expect(r.old_value).toBeNull();
    expect(r.new_value).toMatchObject({ id: "ZEN-2026-01", status: "Reported" });
    expect(r.defect_id).toBe("ZEN-2026-01");
  });

  it("emits one row per changed field with correct old → new diff", () => {
    defectInsertTrigger(sink, base);
    const next: Defect = {
      ...base,
      status: "In Progress",
      priority: "High",
      assigned_agent: "Bob",
      updated_by: "Carol",
    };
    defectUpdateTrigger(sink, base, next);

    const updates = sink.rows.slice(1);
    expect(updates).toHaveLength(3);

    const status = updates.find((r) => r.action === "defect.status_changed")!;
    expect(status.old_value).toEqual({ status: "Reported" });
    expect(status.new_value).toEqual({ status: "In Progress" });
    expect(status.actor_name).toBe("Carol");

    const assign = updates.find((r) => r.action === "defect.assigned")!;
    expect(assign.old_value).toEqual({ assigned_agent: null });
    expect(assign.new_value).toEqual({ assigned_agent: "Bob" });

    const prio = updates.find((r) => r.action === "defect.priority_changed")!;
    expect(prio.old_value).toEqual({ priority: "Medium" });
    expect(prio.new_value).toEqual({ priority: "High" });
  });

  it("distinguishes defect.closed and defect.reopened from generic status_changed", () => {
    defectUpdateTrigger(sink, base, { ...base, status: "Closed", updated_by: "Alice" });
    defectUpdateTrigger(sink,
      { ...base, status: "Closed" },
      { ...base, status: "Open", updated_by: "Alice" });
    expect(sink.rows.map((r) => r.action)).toEqual([
      "defect.closed",
      "defect.reopened",
    ]);
  });

  it("does not emit any row when no tracked field changed", () => {
    defectUpdateTrigger(sink, base, { ...base });
    expect(sink.rows).toHaveLength(0);
  });
});

describe("activity_log: task lifecycle produces accurate before/after values", () => {
  let sink: Sink;
  const base: Task = {
    id: "TASK-2026-01",
    status: "Pending",
    assigned_agent_id: "u-bob",
    assigned_agent_name: "Bob",
    assigned_by_id: "u-alice",
    assigned_by_name: "Alice",
    environment: "Production",
    tax_year: "2026",
  };
  beforeEach(() => { sink = makeSink(); });

  it("emits task.created and task.assigned on insert with assignee", () => {
    taskInsertTrigger(sink, base);
    expect(sink.rows.map((r) => r.action)).toEqual(["task.created", "task.assigned"]);
    expect(sink.rows[1].new_value).toEqual({ assigned_to: "Bob" });
  });

  it("captures reassignment diff with old and new assignee names", () => {
    taskUpdateTrigger(sink, base, {
      ...base,
      assigned_agent_id: "u-carol",
      assigned_agent_name: "Carol",
    });
    const r = sink.rows[0];
    expect(r.action).toBe("task.reassigned");
    expect(r.old_value).toEqual({ assigned_to: "Bob" });
    expect(r.new_value).toEqual({ assigned_to: "Carol" });
  });

  it("maps Completed/Pending to task.completed and task.reopened", () => {
    taskUpdateTrigger(sink, base, { ...base, status: "Completed" });
    taskUpdateTrigger(sink,
      { ...base, status: "Completed" },
      { ...base, status: "Pending" });
    expect(sink.rows.map((r) => r.action)).toEqual([
      "task.completed",
      "task.reopened",
    ]);
    expect(sink.rows[0].old_value).toEqual({ status: "Pending" });
    expect(sink.rows[0].new_value).toEqual({ status: "Completed" });
  });
});

describe("activity_log: realtime fan-out delivers rows without refresh", () => {
  it("subscribers receive inserted rows in order, immediately", () => {
    const sink = makeSink();
    const received: ActivityRow[] = [];
    const unsub = sink.subscribe((r) => received.push(r));

    defectInsertTrigger(sink, {
      id: "ZEN-2026-02", title: "x", status: "Reported", priority: "Low",
      severity: "Minor", validity: "Unverified", assigned_agent: null,
      environment: "Production", form_name: "1040", tax_year: "2026",
      created_by: "Alice", updated_by: "Alice",
    });
    taskInsertTrigger(sink, {
      id: "TASK-2026-02", status: "Pending",
      assigned_agent_id: null, assigned_agent_name: null,
      assigned_by_id: "u-alice", assigned_by_name: "Alice",
      environment: "Production", tax_year: "2026",
    });

    expect(received).toHaveLength(2);
    expect(received[0].action).toBe("defect.created");
    expect(received[1].action).toBe("task.created");

    unsub();
    defectInsertTrigger(sink, {
      id: "ZEN-2026-03", title: "y", status: "Reported", priority: "Low",
      severity: "Minor", validity: "Unverified", assigned_agent: null,
      environment: "Production", form_name: "1040", tax_year: "2026",
      created_by: "Alice", updated_by: "Alice",
    });
    // unsubscribed subscriber must not receive further events
    expect(received).toHaveLength(2);
  });

  it("multiple subscribers each receive a copy of every event", () => {
    const sink = makeSink();
    const a: ActivityRow[] = [];
    const b: ActivityRow[] = [];
    sink.subscribe((r) => a.push(r));
    sink.subscribe((r) => b.push(r));
    taskInsertTrigger(sink, {
      id: "TASK-2026-03", status: "Pending",
      assigned_agent_id: "u-bob", assigned_agent_name: "Bob",
      assigned_by_id: "u-alice", assigned_by_name: "Alice",
      environment: "Production", tax_year: "2026",
    });
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
    expect(a.map((r) => r.action)).toEqual(b.map((r) => r.action));
  });
});

describe("recordAuthEvent invokes log_activity RPC with correct shape", () => {
  beforeEach(() => vi.resetModules());

  type RpcCall = (fn: string, args: Record<string, unknown>) => Promise<{ data: null; error: null }>;
  const okRpc = () => vi.fn<RpcCall>(async () => ({ data: null, error: null }));

  it("login event uses auth category and success result", async () => {
    const rpc = okRpc();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { rpc },
    }));
    const { recordAuthEvent } = await import("./activityLog");
    await recordAuthEvent({ kind: "login", email: "admin@qaportal.app", success: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe("log_activity");
    expect(args).toMatchObject({
      _category: "auth",
      _action: "auth.login",
      _result: "success",
      _record_id: "admin@qaportal.app",
    });
    expect(String(args._summary)).toContain("signed in");
  });

  it("failed login records result=failure with reason metadata", async () => {
    const rpc = okRpc();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { rpc },
    }));
    const { recordAuthEvent } = await import("./activityLog");
    await recordAuthEvent({
      kind: "login", email: "x@y.z", success: false, reason: "invalid_password",
    });
    const args = rpc.mock.calls[0]![1];
    expect(args._result).toBe("failure");
    expect(args._metadata).toEqual({ reason: "invalid_password" });
  });

  it("profile_updated uses user_mgmt category", async () => {
    const rpc = okRpc();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { rpc },
    }));
    const { recordAuthEvent } = await import("./activityLog");
    await recordAuthEvent({ kind: "profile_updated", email: "a@b.c" });
    expect(rpc.mock.calls[0]![1]._category).toBe("user_mgmt");
    expect(rpc.mock.calls[0]![1]._action).toBe("auth.profile_updated");
  });

  it("swallows RPC errors so user flow is never blocked", async () => {
    const rpc = vi.fn<RpcCall>(async () => { throw new Error("network"); });
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { rpc },
    }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { recordAuthEvent } = await import("./activityLog");
    await expect(
      recordAuthEvent({ kind: "logout", email: "a@b.c" }),
    ).resolves.toBeUndefined();
    warn.mockRestore();
  });
});