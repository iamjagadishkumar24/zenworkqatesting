import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { useRetests, type RetestPriority, type RetestStatus } from "@/lib/qa/retest";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ClipboardCheck, Plus, X } from "lucide-react";

export const Route = createFileRoute("/_app/retest")({
  component: RetestPage,
});

const STATUSES: RetestStatus[] = ["Assigned", "In Progress", "Retested", "Completed", "Cancelled"];
const PRIORITIES: RetestPriority[] = ["Low", "Medium", "High", "Critical"];

function RetestPage() {
  const { currentUser, users, forms } = useQA();
  const { env } = useEnvironment();
  const { items, loading, createAssignment, updateAssignment, reassign, cancel } = useRetests();
  const isAdmin = currentUser?.role === "admin";
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Retest Assignments</h2>
          <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
            {isAdmin ? "Assign forms to agents for retesting and track progress." : "Forms assigned to you for retesting."}
            {env && <Badge variant="outline">{env}</Badge>}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setOpen((o) => !o)}>
            {open ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {open ? "Cancel" : "Assign Retest"}
          </Button>
        )}
      </div>

      {isAdmin && open && (
        <CreateForm
          agents={users.filter((u) => u.active).map((u) => u.name)}
          forms={forms.map((f) => ({ id: f.id, name: f.name }))}
          onCreate={async (input) => {
            const r = await createAssignment(input);
            if (r.ok) { toast.success("Retest assigned"); setOpen(false); }
            else toast.error(r.error);
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base inline-flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> {isAdmin ? "All retest tasks" : "My retest tasks"}
          </CardTitle>
          <CardDescription>{loading ? "Loading…" : `${items.length} task(s)`}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No retest tasks in this environment yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Forms</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => {
                  const canEditStatus = isAdmin || r.assigned_agent_id === currentUser?.id;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="max-w-[260px]">
                        <div className="flex flex-wrap gap-1">
                          {r.forms.map((f) => <Badge key={f.id} variant="secondary">{f.form_name}</Badge>)}
                        </div>
                        {r.instructions && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.instructions}</p>}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Select value={r.assigned_agent_name} onValueChange={async (v) => {
                            const res = await reassign(r.id, v);
                            if (!res.ok) toast.error(res.error); else toast.success("Reassigned");
                          }}>
                            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {users.filter((u) => u.active).map((u) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : r.assigned_agent_name}
                      </TableCell>
                      <TableCell>
                        {isAdmin ? (
                          <Select value={r.priority} onValueChange={async (v) => {
                            const res = await updateAssignment(r.id, { priority: v as RetestPriority });
                            if (!res.ok) toast.error(res.error);
                          }}>
                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : <Badge variant="outline">{r.priority}</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{r.due_date ?? "—"}</TableCell>
                      <TableCell>
                        <Select value={r.status} disabled={!canEditStatus} onValueChange={async (v) => {
                          const res = await updateAssignment(r.id, { status: v as RetestStatus });
                          if (!res.ok) toast.error(res.error); else toast.success("Status updated");
                        }}>
                          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.updated_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdmin && r.status !== "Cancelled" && r.status !== "Completed" && (
                          <Button size="sm" variant="ghost" onClick={async () => {
                            const res = await cancel(r.id);
                            if (!res.ok) toast.error(res.error); else toast.success("Cancelled");
                          }}>Cancel</Button>
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

function CreateForm({
  agents, forms, onCreate,
}: {
  agents: string[];
  forms: { id: string; name: string }[];
  onCreate: (i: { agentName: string; forms: { id: string; name: string }[]; instructions: string; priority: RetestPriority; dueDate: string | null }) => Promise<void>;
}) {
  const [agent, setAgent] = useState(agents[0] ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [instructions, setInstructions] = useState("");
  const [priority, setPriority] = useState<RetestPriority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [filter, setFilter] = useState("");
  const filtered = useMemo(
    () => forms.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase())),
    [forms, filter],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New retest assignment</CardTitle>
        <CardDescription>Select one or more forms and assign them to an agent in the current environment.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Agent</Label>
          <Select value={agent} onValueChange={setAgent}>
            <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
            <SelectContent>{agents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as RetestPriority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div>
          <Label>Filter forms</Label>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search by name…" />
        </div>
        <div className="md:col-span-2">
          <Label>Forms ({picked.size} selected)</Label>
          <div className="mt-1 max-h-56 overflow-auto rounded-md border p-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((f) => {
              const checked = picked.has(f.id);
              return (
                <label key={f.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted text-sm">
                  <Checkbox checked={checked} onCheckedChange={(c) => {
                    setPicked((s) => {
                      const n = new Set(s);
                      if (c) n.add(f.id); else n.delete(f.id);
                      return n;
                    });
                  }} />
                  <span className="truncate">{f.name}</span>
                </label>
              );
            })}
            {filtered.length === 0 && <p className="text-xs text-muted-foreground">No forms match.</p>}
          </div>
        </div>
        <div className="md:col-span-2">
          <Label>Retest instructions</Label>
          <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={() => {
            const selected = forms.filter((f) => picked.has(f.id));
            void onCreate({
              agentName: agent,
              forms: selected,
              instructions,
              priority,
              dueDate: dueDate || null,
            });
          }}>Assign</Button>
        </div>
      </CardContent>
    </Card>
  );
}