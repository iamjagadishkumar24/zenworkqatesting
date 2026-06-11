import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQA } from "./store";

export type AgentInviteStatus = "pending" | "active" | "inactive";
export type AgentInvite = {
  id: string;
  email: string;
  name: string;
  status: AgentInviteStatus;
  notes: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
};

export function useAgentInvites() {
  const { currentUser } = useQA();
  const [items, setItems] = useState<AgentInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("agent_invites")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setItems((data ?? []) as AgentInvite[]);
    } catch (e) {
      console.warn("useAgentInvites: load failed", e);
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
      ch = supabase
        .channel(`agent-invites-${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "agent_invites" }, () => void load())
        .subscribe();
    } catch (e) {
      console.warn("useAgentInvites: subscribe failed", e);
    }
    return () => { if (ch) { try { void supabase.removeChannel(ch); } catch { /* noop */ } } };
  }, [currentUser, load]);

  const create = async (input: { email: string; name: string; notes?: string }) => {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email" };
    if (name.length < 2) return { ok: false, error: "Name is required" };
    const { error } = await supabase.from("agent_invites").insert({
      email, name, notes: input.notes ?? "", created_by: currentUser?.id ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const setStatus = async (id: string, status: AgentInviteStatus) => {
    const { error } = await supabase.from("agent_invites").update({ status }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("agent_invites").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  return { items, loading, reload: load, create, setStatus, remove };
}