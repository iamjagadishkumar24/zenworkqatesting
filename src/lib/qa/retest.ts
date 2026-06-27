import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQA } from "./store";
import { useEnvironment } from "./environment";
import { validateAssignmentScopeServer } from "./assignment.functions";

export type RetestStatus = "Pending" | "In Progress" | "Completed";
export const RETEST_STATUSES: RetestStatus[] = ["Pending", "In Progress", "Completed"];
export type RetestPriority = "Low" | "Medium" | "High" | "Critical";

export type RetestForm = { id: string; assignment_id: string; form_id: string; form_name: string };
export type RetestAssignment = {
  id: string;
  environment: string;
  assigned_agent_id: string | null;
  assigned_agent_name: string;
  assigned_by_id: string | null;
  assigned_by_name: string;
  instructions: string;
  priority: RetestPriority;
  due_date: string | null;
  due_time: string | null;
  deadline_at: string | null;
  completion_duration_seconds: number | null;
  completed_on_time: boolean | null;
  status: RetestStatus;
  testing_type: string;
  title: string;
  module: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  all_forms?: boolean;
  tax_year?: string | null;
  forms: RetestForm[];
};

// ---------------------------------------------------------------------------
// Module-level cache + shared realtime channel for retest data.
//
// Before: every mount of `useRetests` opened its own Realtime channel and
// re-ran `SELECT * FROM retest_assignments + retest_assignment_forms` on every
// postgres_changes event. With multiple route components mounted that caused
// thousands of redundant fetches (see slow-query audit).
//
// After: one shared cache keyed by user+env, refcounted single channel,
// throttled refetch (300ms trailing) so a burst of realtime events collapses
// into a single round-trip. Per-call dedup + 5s staleTime makes simultaneous
// remounts share the same in-flight request.
// ---------------------------------------------------------------------------

type Snapshot = {
  items: RetestAssignment[];
  loading: boolean;
  error: string | null;
  realtimeOk: boolean;
  fetchedAt: number;
};
const EMPTY_SNAPSHOT: Snapshot = {
  items: [],
  loading: true,
  error: null,
  realtimeOk: true,
  fetchedAt: 0,
};
const RETEST_STALE_MS = 5_000;
const RETEST_REFETCH_THROTTLE_MS = 300;

type EntryRuntime = {
  snapshot: Snapshot;
  listeners: Set<() => void>;
  refCount: number;
  inflight: Promise<void> | null;
  channel: ReturnType<typeof supabase.channel> | null;
  refetchTimer: ReturnType<typeof setTimeout> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  attempts: number;
  cancelled: boolean;
};
const entries = new Map<string, EntryRuntime>();

function emit(entry: EntryRuntime, next: Snapshot) {
  entry.snapshot = next;
  entry.listeners.forEach((l) => l());
}

async function fetchRetests(entry: EntryRuntime): Promise<void> {
  if (entry.inflight) return entry.inflight;
  const p = (async () => {
    try {
      const [a, f] = await Promise.all([
        supabase.from("retest_assignments").select("*").order("created_at", { ascending: false }),
        supabase.from("retest_assignment_forms").select("*"),
      ]);
      if (a.error) throw a.error;
      if (f.error) throw f.error;
      const forms = (f.data ?? []) as RetestForm[];
      const rows = ((a.data ?? []) as Omit<RetestAssignment, "forms">[]).map((r) => ({
        ...r,
        forms: forms.filter((x) => x.assignment_id === r.id),
      }));
      const byId = new Map<string, RetestAssignment>();
      for (const r of rows) byId.set(r.id, r);
      emit(entry, {
        ...entry.snapshot,
        items: Array.from(byId.values()),
        loading: false,
        error: null,
        fetchedAt: Date.now(),
      });
    } catch (e) {
      console.warn("useRetests: load failed", e);
      emit(entry, {
        ...entry.snapshot,
        loading: false,
        error: e instanceof Error ? e.message : "Failed to load tasks",
      });
    } finally {
      entry.inflight = null;
    }
  })();
  entry.inflight = p;
  return p;
}

function scheduleRefetch(entry: EntryRuntime) {
  if (entry.refetchTimer) return;
  entry.refetchTimer = setTimeout(() => {
    entry.refetchTimer = null;
    void fetchRetests(entry);
  }, RETEST_REFETCH_THROTTLE_MS);
}

function openChannel(key: string, entry: EntryRuntime, userId: string, env: string | null) {
  if (entry.cancelled || entry.channel) return;
  const channelName = `retest-${userId}-${env ?? "any"}-${Date.now()}`;
  try {
    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "retest_assignments" },
        () => scheduleRefetch(entry),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "retest_assignment_forms" },
        () => scheduleRefetch(entry),
      )
      .subscribe((status) => {
        if (entry.cancelled) return;
        if (status === "SUBSCRIBED") {
          entry.attempts = 0;
          emit(entry, { ...entry.snapshot, realtimeOk: true });
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          scheduleRefetch(entry);
          const dead = entry.channel;
          entry.channel = null;
          if (dead) {
            try {
              void supabase.removeChannel(dead);
            } catch {
              /* noop */
            }
          }
          entry.attempts += 1;
          if (entry.attempts >= 3)
            emit(entry, { ...entry.snapshot, realtimeOk: false });
          const delay = Math.min(30000, 1000 * 2 ** Math.min(entry.attempts, 5));
          entry.retryTimer = setTimeout(() => openChannel(key, entry, userId, env), delay);
        }
      });
    entry.channel = ch;
  } catch (e) {
    console.warn("useRetests: realtime subscribe failed", e);
    entry.attempts += 1;
    if (entry.attempts >= 3) emit(entry, { ...entry.snapshot, realtimeOk: false });
    entry.retryTimer = setTimeout(
      () => openChannel(key, entry, userId, env),
      Math.min(30000, 1000 * 2 ** Math.min(entry.attempts, 5)),
    );
  }
}

function acquireEntry(userId: string, env: string | null): EntryRuntime {
  const key = `${userId}::${env ?? "any"}`;
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      snapshot: EMPTY_SNAPSHOT,
      listeners: new Set(),
      refCount: 0,
      inflight: null,
      channel: null,
      refetchTimer: null,
      retryTimer: null,
      attempts: 0,
      cancelled: false,
    };
    entries.set(key, entry);
    openChannel(key, entry, userId, env);
    void fetchRetests(entry);
  } else if (Date.now() - entry.snapshot.fetchedAt > RETEST_STALE_MS) {
    void fetchRetests(entry);
  }
  entry.refCount += 1;
  return entry;
}

function releaseEntry(userId: string, env: string | null) {
  const key = `${userId}::${env ?? "any"}`;
  const entry = entries.get(key);
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount > 0) return;
  // Teardown: no more consumers. Drop the channel and timers; keep the cache
  // briefly so quick remounts can reuse it (GC by overwrite on next access).
  entry.cancelled = true;
  if (entry.refetchTimer) clearTimeout(entry.refetchTimer);
  if (entry.retryTimer) clearTimeout(entry.retryTimer);
  if (entry.channel) {
    try {
      void supabase.removeChannel(entry.channel);
    } catch {
      /* noop */
    }
    entry.channel = null;
  }
  entries.delete(key);
}

export function useRetests() {
  const { currentUser, users } = useQA();
  const { env } = useEnvironment();

  // Subscribe to the shared per-(user,env) cache via useSyncExternalStore so
  // each consumer rerenders only when this slice actually changes.
  const userId = currentUser?.id ?? null;
  const envKey = env ?? null;
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!userId) return () => {};
      const entry = acquireEntry(userId, envKey);
      entry.listeners.add(cb);
      return () => {
        entry.listeners.delete(cb);
        releaseEntry(userId, envKey);
      };
    },
    [userId, envKey],
  );
  const getSnapshot = useCallback((): Snapshot => {
    if (!userId) return EMPTY_SNAPSHOT;
    const key = `${userId}::${envKey ?? "any"}`;
    return entries.get(key)?.snapshot ?? EMPTY_SNAPSHOT;
  }, [userId, envKey]);
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const items = snap.items;
  const loading = snap.loading;
  const error = snap.error;
  const realtimeOk = snap.realtimeOk;

  const scoped = useMemo(
    () =>
      items.filter((r) => {
        if (env && r.environment !== env) return false;
        if (currentUser?.role === "agent") return r.assigned_agent_id === currentUser.id;
        return true;
      }),
    [items, env, currentUser?.id, currentUser?.role],
  );

  const load = useCallback(async () => {
    if (!userId) return;
    const key = `${userId}::${envKey ?? "any"}`;
    const entry = entries.get(key);
    if (entry) await fetchRetests(entry);
  }, [userId, envKey]);

  const createAssignment = async (input: {
    agentName?: string;
    /** When true, ignore agentName and create one assignment per active agent. */
    assignToAll?: boolean;
    /** Multi-agent: explicit agent names to assign to (registered agents). */
    agentNames?: string[];
    /** Pending invite emails to pre-assign (materialized on signup). */
    pendingEmails?: string[];
    /** When true, assignment covers every form (no form rows written). */
    allForms?: boolean;
    taxYear?: string | null;
    forms: { id: string; name: string }[];
    instructions: string;
    priority: RetestPriority;
    dueDate: string | null;
    dueTime?: string | null;
    title?: string;
    module?: string;
  }) => {
    if (!currentUser) return { ok: false, error: "Not signed in" };
    // Server-side scope guard — runs BEFORE any DB write so a tampered
    // client or stale dialog state can't persist forms outside the
    // selected Module / Category + Testing Type combination.
    try {
      const check = await validateAssignmentScopeServer({
        data: {
          module: input.module ?? "",
          allForms: !!input.allForms,
          formNames: (input.forms ?? []).map((f) => f.name),
        },
      });
      if (!check.ok) {
        return { ok: false, error: check.error, offenders: check.offenders };
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Validation failed" };
    }
    const names = new Set<string>();
    if (input.assignToAll) {
      users.filter((u) => u.active && u.role === "agent").forEach((u) => names.add(u.name));
    }
    (input.agentNames ?? []).forEach((n) => names.add(n));
    if (input.agentName) names.add(input.agentName);
    const targets = users.filter((u) => names.has(u.name));
    const pendingEmails = (input.pendingEmails ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (!targets.length && !pendingEmails.length)
      return { ok: false, error: "Select at least one agent" };
    const created: string[] = [];
    for (const agent of targets) {
      const ty =
        input.taxYear && /^\d{4}$/.test(input.taxYear)
          ? input.taxYear
          : String(new Date().getFullYear());
      const { data: nextId, error: idErr } = await supabase.rpc("next_scoped_id", {
        _kind: "task",
        _tax_year: ty,
      });
      if (idErr || !nextId)
        return { ok: false, error: idErr?.message ?? "Could not allocate task id" };
      const id = nextId as string;
      const { error } = await supabase.from("retest_assignments").insert({
        id,
        environment: env ?? "Production",
        assigned_agent_id: agent.id,
        assigned_agent_name: agent.name,
        assigned_by_id: currentUser.id,
        assigned_by_name: currentUser.name,
        instructions: input.instructions,
        priority: input.priority,
        due_date: input.dueDate,
        due_time: input.dueTime ?? null,
        status: "Pending",
        title: input.title ?? "",
        module: input.module ?? "",
        all_forms: !!input.allForms,
        tax_year: input.taxYear ?? null,
      });
      if (error) return { ok: false, error: error.message };
      if (!input.allForms && input.forms.length) {
        const rows = input.forms.map((f) => ({
          assignment_id: id,
          form_id: f.id,
          form_name: f.name,
        }));
        const { error: e2 } = await supabase.from("retest_assignment_forms").insert(rows);
        if (e2) return { ok: false, error: e2.message };
      }
      created.push(id);
    }
    // Pre-assign to pending invitees (materialized when they sign up)
    for (const email of pendingEmails) {
      const payload = {
        environment: env ?? "Production",
        instructions: input.instructions,
        priority: input.priority,
        due_date: input.dueDate,
        due_time: input.dueTime ?? null,
        title: input.title ?? "",
        module: input.module ?? "",
        all_forms: !!input.allForms,
        tax_year: input.taxYear ?? "",
      };
      const { error } = await supabase.from("retest_pending_assignments").insert({
        email,
        payload,
        forms: input.allForms ? [] : input.forms.map((f) => ({ id: f.id, name: f.name })),
        created_by_id: currentUser.id,
        created_by_name: currentUser.name,
      });
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true, ids: created };
  };

  const updateAssignment = async (
    id: string,
    patch: Partial<
      Pick<
        RetestAssignment,
        | "status"
        | "instructions"
        | "priority"
        | "due_date"
        | "due_time"
        | "assigned_agent_id"
        | "assigned_agent_name"
      >
    >,
  ) => {
    const { error } = await supabase.from("retest_assignments").update(patch).eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const reassign = async (id: string, agentName: string) => {
    const agent = users.find((u) => u.name === agentName);
    if (!agent) return { ok: false, error: "Agent not found" };
    return updateAssignment(id, { assigned_agent_id: agent.id, assigned_agent_name: agent.name });
  };

  /** Edit the scoped fields of an existing assignment (module, testing
   *  type, all_forms flag, and the form/feature rows). The server-side
   *  scope guard runs first; on success the retest_assignment_forms rows
   *  are replaced atomically so old picks from a different module can
   *  never leak through. */
  const editAssignmentScope = async (
    id: string,
    input: {
      module: string;
      allForms: boolean;
      forms: { id: string; name: string }[];
    },
  ) => {
    try {
      const check = await validateAssignmentScopeServer({
        data: {
          module: input.module,
          allForms: input.allForms,
          formNames: input.forms.map((f) => f.name),
        },
      });
      if (!check.ok) {
        return { ok: false, error: check.error, offenders: check.offenders };
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Validation failed" };
    }
    const { error: e1 } = await supabase
      .from("retest_assignments")
      .update({
        module: input.module,
        all_forms: input.allForms,
      })
      .eq("id", id);
    if (e1) return { ok: false, error: e1.message };
    // Replace form rows wholesale — prevents stale picks from a prior module.
    const { error: e2 } = await supabase
      .from("retest_assignment_forms")
      .delete()
      .eq("assignment_id", id);
    if (e2) return { ok: false, error: e2.message };
    if (!input.allForms && input.forms.length) {
      const rows = input.forms.map((f) => ({
        assignment_id: id,
        form_id: f.id,
        form_name: f.name,
      }));
      const { error: e3 } = await supabase.from("retest_assignment_forms").insert(rows);
      if (e3) return { ok: false, error: e3.message };
    }
    return { ok: true };
  };

  return {
    items: scoped,
    all: items,
    loading,
    error,
    realtimeOk,
    createAssignment,
    updateAssignment,
    reassign,
    editAssignmentScope,
    reload: load,
  };
}
