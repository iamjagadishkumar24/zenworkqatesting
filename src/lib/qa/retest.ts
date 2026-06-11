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
  forms: RetestForm[];
};

export function useRetests() {
  const { currentUser, users } = useQA();
  const { env } = useEnvironment();
  const [items, setItems] = useState<RetestAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, f] = await Promise.all([
        supabase.from("retest_assignments").select("*").order("created_at", { ascending: false }),
        supabase.from("retest_assignment_forms").select("*"),
      ]);
      const forms = (f.data ?? []) as RetestForm[];
      const rows = ((a.data ?? []) as Omit<RetestAssignment, "forms">[]).map((r) => ({
        ...r,
        forms: forms.filter((x) => x.assignment_id === r.id),
      }));
      setItems(rows);
    } catch (e) {
      console.warn("useRetests: load failed", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void load();
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      const channelName = `retest-realtime-${Math.random().toString(36).slice(2, 9)}`;
      ch = supabase
        .channel(channelName)
        .on("postgres_changes", { event: "*", schema: "public", table: "retest_assignments" }, () => void load())
        .on("postgres_changes", { event: "*", schema: "public", table: "retest_assignment_forms" }, () => void load())
        .subscribe();
    } catch (e) {
      console.warn("useRetests: realtime subscribe failed", e);
    }
    return () => { if (ch) { try { void supabase.removeChannel(ch); } catch { /* noop */ } } };
  }, [currentUser, load]);

  const scoped = items.filter((r) => {
    if (env && r.environment !== env) return false;
    if (currentUser?.role === "agent") return r.assigned_agent_id === currentUser.id;
    return true;
  });

  const createAssignment = async (input: {
    agentName?: string;
    /** When true, ignore agentName and create one assignment per active agent. */
    assignToAll?: boolean;
    forms: { id: string; name: string }[];
    instructions: string;
    priority: RetestPriority;
    dueDate: string | null;
    testingType?: string;
    title?: string;
    module?: string;
  }) => {
    if (!currentUser) return { ok: false, error: "Not signed in" };
    const targets = input.assignToAll
      ? users.filter((u) => u.active && u.role === "agent")
      : (() => {
          const a = users.find((u) => u.name === input.agentName);
          return a ? [a] : [];
        })();
    if (!targets.length) return { ok: false, error: "Select at least one agent" };
    const created: string[] = [];
    for (const agent of targets) {
      const id = `RT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
      });
      if (error) return { ok: false, error: error.message };
      if (input.forms.length) {
        const rows = input.forms.map((f) => ({ assignment_id: id, form_id: f.id, form_name: f.name }));
        const { error: e2 } = await supabase.from("retest_assignment_forms").insert(rows);
        if (e2) return { ok: false, error: e2.message };
      }
      created.push(id);
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

  return { items: scoped, all: items, loading, createAssignment, updateAssignment, reassign, reload: load };
}