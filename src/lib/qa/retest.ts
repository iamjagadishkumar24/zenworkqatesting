import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQA } from "./store";
import { useEnvironment } from "./environment";

export type RetestStatus = "Pending" | "In Progress" | "Completed";
export const RETEST_STATUSES: RetestStatus[] = ["Pending", "In Progress", "Completed"];
export type RetestPriority = "Low" | "Medium" | "High" | "Critical";

export const TESTING_TYPES = [
  "Form testing",
  "Functionality testing",
  "Integration testing",
  "Excel import testing",
  "Chatbot testing",
  "Tax1099 feature testing",
  "1099 Online testing",
  "2290 Forms testing",
  "990 Forms testing",
  "Retest",
] as const;
export type TestingType = (typeof TESTING_TYPES)[number];

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

export function useRetests() {
  const { currentUser, users } = useQA();
  const { env } = useEnvironment();
  const [items, setItems] = useState<RetestAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
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
      // Dedupe by id (defensive — protects against stale concurrent fetches).
      const byId = new Map<string, RetestAssignment>();
      for (const r of rows) byId.set(r.id, r);
      setItems(Array.from(byId.values()));
      setError(null);
    } catch (e) {
      console.warn("useRetests: load failed", e);
      setError(e instanceof Error ? e.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void load();
    let ch: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const connect = () => {
      if (cancelled) return;
      // Unique channel name per attempt so a stale CHANNEL_ERROR socket can't
      // collide with the retry. Includes user+env so switching environment
      // tears down the previous channel and never duplicates.
      const channelName = `retest-${currentUser.id}-${env ?? "any"}-${Date.now()}`;
      try {
        ch = supabase
          .channel(channelName)
          .on("postgres_changes", { event: "*", schema: "public", table: "retest_assignments" }, () => void load())
          .on("postgres_changes", { event: "*", schema: "public", table: "retest_assignment_forms" }, () => void load())
          .subscribe((status) => {
            if (cancelled) return;
            if (status === "SUBSCRIBED") {
              attempts = 0;
              setRealtimeOk(true);
              return;
            }
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              // Refresh on reconnect so we don't miss events while offline.
              void load();
              // Tear down this channel and schedule a backoff retry.
              const dead = ch;
              ch = null;
              if (dead) { try { void supabase.removeChannel(dead); } catch { /* noop */ } }
              attempts += 1;
              // Only surface the warning after a few sustained failures.
              if (attempts >= 3) setRealtimeOk(false);
              const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts, 5));
              retryTimer = setTimeout(connect, delay);
            }
          });
      } catch (e) {
        console.warn("useRetests: realtime subscribe failed", e);
        attempts += 1;
        if (attempts >= 3) setRealtimeOk(false);
        retryTimer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempts, 5)));
      }
    };
    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ch) { try { void supabase.removeChannel(ch); } catch { /* noop */ } }
    };
  }, [currentUser, env, load]);

  const scoped = items.filter((r) => {
    if (env && r.environment !== env) return false;
    if (currentUser?.role === "agent") return r.assigned_agent_id === currentUser.id;
    return true;
  });

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
    testingType?: string;
    title?: string;
    module?: string;
  }) => {
    if (!currentUser) return { ok: false, error: "Not signed in" };
    const names = new Set<string>();
    if (input.assignToAll) {
      users.filter((u) => u.active && u.role === "agent").forEach((u) => names.add(u.name));
    }
    (input.agentNames ?? []).forEach((n) => names.add(n));
    if (input.agentName) names.add(input.agentName);
    const targets = users.filter((u) => names.has(u.name));
    const pendingEmails = (input.pendingEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!targets.length && !pendingEmails.length) return { ok: false, error: "Select at least one agent" };
    const created: string[] = [];
    for (const agent of targets) {
      const ty = (input.taxYear && /^\d{4}$/.test(input.taxYear)) ? input.taxYear : String(new Date().getFullYear());
      const { data: nextId, error: idErr } = await supabase.rpc("next_scoped_id", { _kind: "task", _tax_year: ty });
      if (idErr || !nextId) return { ok: false, error: idErr?.message ?? "Could not allocate task id" };
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
        status: "Pending",
        testing_type: input.testingType ?? "Retest",
        title: input.title ?? "",
        module: input.module ?? "",
        all_forms: !!input.allForms,
        tax_year: input.taxYear ?? null,
      });
      if (error) return { ok: false, error: error.message };
      if (!input.allForms && input.forms.length) {
        const rows = input.forms.map((f) => ({ assignment_id: id, form_id: f.id, form_name: f.name }));
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
        testing_type: input.testingType ?? "Retest",
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

  const updateAssignment = async (id: string, patch: Partial<Pick<RetestAssignment,
    "status" | "instructions" | "priority" | "due_date" | "assigned_agent_id" | "assigned_agent_name">>) => {
    const { error } = await supabase.from("retest_assignments").update(patch).eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const reassign = async (id: string, agentName: string) => {
    const agent = users.find((u) => u.name === agentName);
    if (!agent) return { ok: false, error: "Agent not found" };
    return updateAssignment(id, { assigned_agent_id: agent.id, assigned_agent_name: agent.name });
  };

  return { items: scoped, all: items, loading, error, realtimeOk, createAssignment, updateAssignment, reassign, reload: load };
}