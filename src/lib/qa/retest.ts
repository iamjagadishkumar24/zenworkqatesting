import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQA } from "./store";
import { useEnvironment } from "./environment";

export type RetestStatus = "Assigned" | "In Progress" | "Retested" | "Completed" | "Cancelled";
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
  status: RetestStatus;
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
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    void load();
    const ch = supabase
      .channel("retest-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "retest_assignments" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "retest_assignment_forms" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [currentUser, load]);

  const scoped = items.filter((r) => {
    if (env && r.environment !== env) return false;
    if (currentUser?.role === "agent") return r.assigned_agent_id === currentUser.id;
    return true;
  });

  const createAssignment = async (input: {
    agentName: string;
    formIds: string[];
    instructions: string;
    priority: RetestPriority;
    dueDate: string | null;
  }) => {
    if (!currentUser) return { ok: false, error: "Not signed in" };
    const agent = users.find((u) => u.name === input.agentName);
    if (!agent) return { ok: false, error: "Select an agent" };
    if (!input.formIds.length) return { ok: false, error: "Select at least one form" };
    const id = `RT-${Date.now()}`;
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
      status: "Assigned",
    });
    if (error) return { ok: false, error: error.message };
    const { forms } = await import("./forms-isolation.test").catch(() => ({ forms: [] as never[] }));
    void forms;
    const rows = input.formIds.map((fid) => ({ assignment_id: id, form_id: fid, form_name: fid }));
    const { error: e2 } = await supabase.from("retest_assignment_forms").insert(rows);
    if (e2) return { ok: false, error: e2.message };
    return { ok: true, id };
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

  const cancel = (id: string) => updateAssignment(id, { status: "Cancelled" });

  return { items: scoped, all: items, loading, createAssignment, updateAssignment, reassign, cancel, reload: load };
}