import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useAgentInvites, type AgentInviteStatus } from "@/lib/qa/agents";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, Trash2, Users, Send, Eye } from "lucide-react";
import { AgentDetailDrawer } from "@/components/qa/AgentDetailDrawer";

export const Route = createFileRoute("/_app/agents")({
  component: AgentsPage,
  errorComponent: ({ error, reset }) => (
    <div className="rounded-lg border bg-card p-6 text-center">
      <h2 className="text-lg font-semibold">Unable to load agent management.</h2>
      <p className="mt-1 text-sm text-muted-foreground">{error?.message ?? "Please try again."}</p>
      <Button className="mt-4" onClick={() => reset()}>Retry</Button>
    </div>
  ),
});

function AgentsPage() {
  const { currentUser, users, defects } = useQA();
  const { items, loading, create, setStatus, remove } = useAgentInvites();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [viewing, setViewing] = useState<{ id: string | null; name: string; email: string } | null>(null);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") return;
    void (async () => {
      try {
        const { data } = await supabase
          .from("retest_assignments")
          .select("assigned_agent_id");
        const map: Record<string, number> = {};
        for (const r of data ?? []) {
          const id = (r as { assigned_agent_id: string | null }).assigned_agent_id;
          if (id) map[id] = (map[id] ?? 0) + 1;
        }
        setTaskCounts(map);
      } catch { /* noop */ }
    })();
  }, [currentUser, items.length]);

  const errorCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of defects) {
      const k = (d.createdBy || "").toLowerCase();
      if (k) m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [defects]);

  if (!currentUser) return null;
  if (currentUser.role !== "admin") return <Navigate to="/dashboard" replace />;

  const submit = async () => {
    setSubmitting(true);
    const r = await create({ email, name, notes });
    setSubmitting(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Agent added. They can now register with this email.");
    setEmail(""); setName(""); setNotes("");
  };

  // Merge: any registered agent without an invite row is shown as "active (direct signup)"
  const inviteEmails = new Set(items.map((i) => i.email.toLowerCase()));
  const directAgents = users
    .filter((u) => u.role === "agent" && !inviteEmails.has(u.email.toLowerCase()))
    .map((u) => ({
      id: u.id, email: u.email, name: u.name,
      status: (u.active ? "active" : "inactive") as AgentInviteStatus,
      notes: "", user_id: u.id, created_at: "", isInvite: false,
    }));
  const inviteRows = items.map((i) => ({ ...i, isInvite: true }));
  const rows = [...inviteRows, ...directAgents];

  const resendInvite = async (row: { email: string; name: string }) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/login?signup=1&email=${encodeURIComponent(row.email)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(`Invite link copied for ${row.name}`);
    } catch {
      toast.message("Invite link", { description: link });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Agent Management</h2>
        <p className="text-sm text-muted-foreground">
          Add agents by email. They become active once they sign up using the same email; any pre-assigned tasks appear automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base inline-flex items-center gap-2"><UserPlus className="h-4 w-4" /> Add Agent</CardTitle>
          <CardDescription>The agent must sign up with the same email to gain access.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@example.com" />
          </div>
          <div className="md:col-span-3">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes about this agent's scope or permissions." />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button onClick={submit} disabled={submitting}>{submitting ? "Adding…" : "Add Agent"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base inline-flex items-center gap-2"><Users className="h-4 w-4" /> Agents</CardTitle>
          <CardDescription>{loading ? "Loading…" : `${rows.length} agent(s)`}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No agents yet. Add one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Tasks</TableHead>
                  <TableHead className="text-center">Errors</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const statusLabel =
                    !r.user_id && r.status === "pending" ? "Pending Registration"
                      : r.status === "active" ? "Active" : "Inactive";
                  const variant = !r.user_id ? "outline" : r.status === "active" ? "default" : "secondary";
                  const tasks = r.user_id ? (taskCounts[r.user_id] ?? 0) : 0;
                  const errs = errorCounts[r.name.toLowerCase()] ?? 0;
                  return (
                    <TableRow key={`${r.isInvite ? "i" : "u"}-${r.id}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell><Badge variant={variant as never}>{statusLabel}</Badge></TableCell>
                      <TableCell className="text-center text-sm">{tasks}</TableCell>
                      <TableCell className="text-center text-sm">{errs}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{r.notes || "—"}</TableCell>
                      <TableCell className="text-right">
                        {r.isInvite ? (
                          <div className="inline-flex items-center gap-2">
                            <Select
                              value={r.status}
                              onValueChange={async (v) => {
                                const res = await setStatus(r.id, v as AgentInviteStatus);
                                if (!res.ok) toast.error(res.error); else toast.success("Status updated");
                              }}
                            >
                              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                              </SelectContent>
                            </Select>
                            {!r.user_id && (
                              <>
                                <Button size="sm" variant="ghost" title="Resend invite" onClick={() => resendInvite(r)}>
                                  <Send className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" title="Remove" onClick={async () => {
                                  const res = await remove(r.id);
                                  if (!res.ok) toast.error(res.error); else toast.success("Removed");
                                }}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <Button size="sm" variant="ghost" title="View tasks & errors"
                              onClick={() => setViewing({ id: r.user_id, name: r.name, email: r.email })}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="ghost" title="View tasks & errors"
                            onClick={() => setViewing({ id: r.user_id, name: r.name, email: r.email })}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <AgentDetailDrawer open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} agent={viewing} />
    </div>
  );
}