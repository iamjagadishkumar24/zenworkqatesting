import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQA } from "./store";
import { deactivateAgent, reactivateAgent, resendAgentInvite } from "./admin.functions";

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
    await supabase.from("agent_audit_log").insert({
      action: "invite_created", target_email: email, target_name: name,
      performed_by_id: currentUser?.id ?? null, performed_by_name: currentUser?.name ?? null,
    });
    return { ok: true };
  };

  const setStatus = async (id: string, status: AgentInviteStatus) => {
    const { error } = await supabase.from("agent_invites").update({ status }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const remove = async (id: string) => {
    const target = items.find((i) => i.id === id);
    const { error } = await supabase.from("agent_invites").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    if (target) {
      await supabase.from("agent_audit_log").insert({
        action: "invite_removed", target_email: target.email, target_name: target.name,
        performed_by_id: currentUser?.id ?? null, performed_by_name: currentUser?.name ?? null,
      });
    }
    return { ok: true };
  };

  const deactivate = async (userId: string) => {
    try {
      await deactivateAgent({ data: { userId } });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Failed to remove agent" };
    }
  };

  const reactivate = async (userId: string) => {
    try {
      await reactivateAgent({ data: { userId } });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Failed to reactivate agent" };
    }
  };

  const resend = async (email: string) => {
    try {
      const r = await resendAgentInvite({ data: { email } });
      return r;
    } catch (e) {
      return {
        ok: false as const, status: "error" as const,
        message: e instanceof Error ? e.message : "Failed to resend invite",
      };
    }
  };

  return { items, loading, reload: load, create, setStatus, remove, deactivate, reactivate, resend };
}