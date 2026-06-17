import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollText, RefreshCw, Download } from "lucide-react";
import { exportXlsx } from "@/lib/qa/export";

export const Route = createFileRoute("/_app/audit-log")({
  component: AuditLogPage,
});

type AgentAuditAction =
  | "invite_created"
  | "invite_resent"
  | "invite_removed"
  | "agent_deactivated"
  | "agent_reactivated"
  | "agent_deleted";

type AgentAuditRow = {
  id: string;
  action: AgentAuditAction;
  target_user_id: string | null;
  target_email: string;
  target_name: string | null;
  performed_by_id: string | null;
  performed_by_name: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

const ACTIONS: { value: AgentAuditAction | "all"; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "invite_created", label: "Invite created" },
  { value: "invite_resent", label: "Invite resent" },
  { value: "invite_removed", label: "Invite removed" },
  { value: "agent_deactivated", label: "Agent removed/deactivated" },
  { value: "agent_reactivated", label: "Agent reactivated" },
  { value: "agent_deleted", label: "Agent deleted" },
];

function actionBadge(a: AgentAuditAction) {
  const map: Record<AgentAuditAction, { label: string; cls: string }> = {
    invite_created: { label: "Invite created", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
    invite_resent: { label: "Invite resent", cls: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
    invite_removed: { label: "Invite removed", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    agent_deactivated: { label: "Deactivated", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
    agent_reactivated: { label: "Reactivated", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
    agent_deleted: { label: "Deleted", cls: "bg-red-600/20 text-red-700 dark:text-red-300" },
  };
  const m = map[a];
  return <Badge variant="outline" className={m.cls}>{m.label}</Badge>;
}

function AuditLogPage() {
  const { currentUser } = useQA();
  const [rows, setRows] = useState<AgentAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [action, setAction] = useState<AgentAuditAction | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("agent_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      setRows((data ?? []) as AgentAuditRow[]);
    } catch (e) {
      console.warn("audit-log load failed", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser?.role !== "admin") return;
    void load();
    const ch = supabase
      .channel(`agent-audit-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_audit_log" }, () => void load())
      .subscribe();
    return () => { try { void supabase.removeChannel(ch); } catch { /* noop */ } };
  }, [currentUser?.role, load]);

  const filtered = useMemo(() => {
    const e = email.trim().toLowerCase();
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    return rows.filter((r) => {
      if (action !== "all" && r.action !== action) return false;
      if (e && !r.target_email.toLowerCase().includes(e)) return false;
      const t = new Date(r.created_at).getTime();
      if (fromTs && t < fromTs) return false;
      if (toTs && t > toTs) return false;
      return true;
    });
  }, [rows, email, action, from, to]);

  const onExport = () => {
    exportXlsx(
      filtered.map((r) => ({
        Date: new Date(r.created_at).toLocaleString(),
        Action: r.action,
        "Target email": r.target_email,
        "Target name": r.target_name ?? "",
        "Performed by": r.performed_by_name ?? "",
      })),
      `agent-audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`,
      "Audit Log",
    );
  };

  if (currentUser && currentUser.role !== "admin") {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ScrollText className="h-6 w-6" /> Agent Audit Log
          </h1>
          <p className="text-sm text-muted-foreground">Track every invite, removal, reactivation, and resend.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={onExport} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Search by email, action, or date range.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Input placeholder="Email contains…" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select value={action} onValueChange={(v) => setAction(v as AgentAuditAction | "all")}>
              <SelectTrigger><SelectValue placeholder="Action" /></SelectTrigger>
              <SelectContent>
                {ACTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
          {(email || action !== "all" || from || to) && (
            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={() => { setEmail(""); setAction("all"); setFrom(""); setTo(""); }}>
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Events <span className="text-muted-foreground font-normal">({filtered.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[170px]">Date</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target email</TableHead>
                  <TableHead>Target name</TableHead>
                  <TableHead>Performed by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-10">
                      {loading ? "Loading…" : "No audit events match these filters."}
                    </TableCell>
                  </TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{actionBadge(r.action)}</TableCell>
                    <TableCell className="font-medium">{r.target_email}</TableCell>
                    <TableCell>{r.target_name ?? "—"}</TableCell>
                    <TableCell>{r.performed_by_name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}