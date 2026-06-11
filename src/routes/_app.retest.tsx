import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { useRetests, RETEST_STATUSES, type RetestPriority, type RetestStatus } from "@/lib/qa/retest";
import { AssignTaskDialog } from "@/components/qa/AssignTaskDialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ClipboardCheck, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/retest")({
  component: RetestPage,
});

const STATUSES: RetestStatus[] = RETEST_STATUSES;
const PRIORITIES: RetestPriority[] = ["Low", "Medium", "High", "Critical"];

function RetestPage() {
  const { currentUser, users } = useQA();
  const { env } = useEnvironment();
  const { items, loading, updateAssignment, reassign } = useRetests();
  const isAdmin = currentUser?.role === "admin";
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Task Assignments</h2>
          <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
            {isAdmin ? "Assign testing tasks to agents and track progress." : "Tasks assigned to you."}
            {env && <Badge variant="outline">{env}</Badge>}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Assign Task
          </Button>
        )}
      </div>

      {isAdmin && <AssignTaskDialog open={open} onOpenChange={setOpen} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base inline-flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> {isAdmin ? "All tasks" : "My tasks"}
          </CardTitle>
          <CardDescription>{loading ? "Loading…" : `${items.length} task(s)`}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No tasks in this environment yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Type</TableHead>
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
                        {r.title && <p className="text-sm font-medium">{r.title}</p>}
                        {r.module && <p className="text-xs text-muted-foreground">{r.module}</p>}
                        <div className="flex flex-wrap gap-1">
                          {r.forms.map((f) => <Badge key={f.id} variant="secondary">{f.form_name}</Badge>)}
                        </div>
                        {r.instructions && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.instructions}</p>}
                      </TableCell>
                      <TableCell className="text-xs">{r.testing_type || "—"}</TableCell>
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
                        {isAdmin && r.status !== "Completed" && (
                          <Button size="sm" variant="ghost" onClick={async () => {
                            const res = await updateAssignment(r.id, { status: "Completed" });
                            if (!res.ok) toast.error(res.error); else toast.success("Marked completed");
                          }}>Mark completed</Button>
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