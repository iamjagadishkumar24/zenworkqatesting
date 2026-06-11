import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useAgentInvites, type AgentInviteStatus } from "@/lib/qa/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UserPlus, Trash2, Users } from "lucide-react";

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
  const { currentUser, users } = useQA();
  const { items, loading, create, setStatus, remove } = useAgentInvites();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    .map((u) => ({ id: u.id, email: u.email, name: u.name, status: (u.active ? "active" : "inactive") as AgentInviteStatus, notes: "", user_id: u.id, isInvite: false }));
  const inviteRows = items.map((i) => ({ ...i, isInvite: true }));
  const rows = [...inviteRows, ...directAgents];

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
                  return (
                    <TableRow key={`${r.isInvite ? "i" : "u"}-${r.id}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell><Badge variant={variant as never}>{statusLabel}</Badge></TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">{r.notes || "—"}</TableCell>
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
                              <Button size="sm" variant="ghost" onClick={async () => {
                                const res = await remove(r.id);
                                if (!res.ok) toast.error(res.error); else toast.success("Removed");
                              }}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Direct signup</span>
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
    </div>
  );
}