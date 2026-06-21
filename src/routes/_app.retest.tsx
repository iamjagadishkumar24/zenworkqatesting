import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { useRetests, RETEST_STATUSES, type RetestAssignment, type RetestPriority, type RetestStatus } from "@/lib/qa/retest";
import { AssignTaskDialog } from "@/components/qa/AssignTaskDialog";
import { SubmitRetestDialog } from "@/components/qa/SubmitRetestDialog";
import { isRetestForDefect, stripDefectTag } from "@/lib/qa/retestLink";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ClipboardCheck, Plus, AlertCircle, RefreshCw, WifiOff, ExternalLink } from "lucide-react";
import { ClipboardList } from "lucide-react";
import { routeForModule } from "@/lib/qa/constants";
import { deadlineInfo, TIER_CLASSES } from "@/lib/qa/deadline";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/retest")({
  component: RetestPage,
  errorComponent: ({ error, reset }) => (
    <div className="rounded-lg border bg-card p-6 text-center">
      <h2 className="text-lg font-semibold">Unable to load task assignment data.</h2>
      <p className="mt-1 text-sm text-muted-foreground">{error?.message ?? "Please try again."}</p>
      <Button className="mt-4" onClick={() => reset()}>Retry</Button>
    </div>
  ),
});

const STATUSES: RetestStatus[] = RETEST_STATUSES;
const PRIORITIES: RetestPriority[] = ["Low", "Medium", "High", "Critical"];

function RetestPage() {
  const { currentUser, users } = useQA();
  const { env } = useEnvironment();
  const { items, loading, error, realtimeOk, updateAssignment, reassign, reload } = useRetests();
  const isAdmin = currentUser?.role === "admin";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const [open, setOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<RetestAssignment | null>(null);

  // Admin-only cross-agent filters
  const [q, setQ] = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [byFilter, setByFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");

  const assignees = useMemo(
    () => Array.from(new Set(items.map((r) => r.assigned_agent_name).filter(Boolean))).sort(),
    [items],
  );
  const assigners = useMemo(
    () => Array.from(new Set(items.map((r) => r.assigned_by_name).filter(Boolean))).sort(),
    [items],
  );
  const years = useMemo(
    () => Array.from(new Set(items.map((r) => r.tax_year ?? "").filter(Boolean))).sort().reverse(),
    [items],
  );

  const visible = useMemo(() => {
    if (!isAdmin) return items;
    const term = q.trim().toLowerCase();
    return items.filter((r) => {
      if (agentFilter !== "all" && r.assigned_agent_name !== agentFilter) return false;
      if (byFilter !== "all" && r.assigned_by_name !== byFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (priorityFilter !== "all" && r.priority !== priorityFilter) return false;
      if (yearFilter !== "all" && (r.tax_year ?? "") !== yearFilter) return false;
      if (!term) return true;
      return [r.id, r.title, r.module, r.instructions, r.assigned_agent_name, r.assigned_by_name]
        .join(" ").toLowerCase().includes(term);
    });
  }, [items, isAdmin, q, agentFilter, byFilter, statusFilter, priorityFilter, yearFilter]);

  const resetFilters = () => {
    setQ(""); setAgentFilter("all"); setByFilter("all");
    setStatusFilter("all"); setPriorityFilter("all"); setYearFilter("all");
  };

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
      <SubmitRetestDialog open={submitOpen} onOpenChange={setSubmitOpen} assignment={submitTarget} />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="inline-flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="h-4 w-4" /> Unable to load task assignment data. Please try again.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void reload()}>
            <RefreshCw className="mr-2 h-3 w-3" /> Retry
          </Button>
        </div>
      )}
      {!realtimeOk && !error && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs inline-flex items-center gap-2">
          <WifiOff className="h-3 w-3" /> Live updates temporarily unavailable. Retrying…
        </div>
      )}

      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cross-agent filters</CardTitle>
            <CardDescription>View tasks across every agent in this environment.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Input placeholder="Search id, title, module…" value={q} onChange={(e) => setQ(e.target.value)} />
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger><SelectValue placeholder="Assignee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
                  {assignees.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={byFilter} onValueChange={setByFilter}>
                <SelectTrigger><SelectValue placeholder="Assigned by" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assigners</SelectItem>
                  {assigners.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger><SelectValue placeholder="Tax year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All years</SelectItem>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{visible.length} of {items.length} task{items.length === 1 ? "" : "s"}</span>
              <Button size="sm" variant="ghost" onClick={resetFilters}>Reset filters</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base inline-flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> {isAdmin ? "All tasks" : "My tasks"}
          </CardTitle>
          <CardDescription>{loading ? "Loading…" : `${visible.length} task(s)`}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading && visible.length === 0 ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-2/3" />
            </div>
          ) : visible.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {items.length === 0 ? "No tasks in this environment yet." : "No tasks match the current filters."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Tax Year</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Time Remaining</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => {
                  const canEditStatus = isAdmin || r.assigned_agent_id === currentUser?.id;
                  const isMine = r.assigned_agent_id === currentUser?.id;
                  const isRetestForError = isRetestForDefect(r.title);
                  const canSubmitRetest = isMine && isRetestForError && r.status !== "Completed";
                  const displayTitle = stripDefectTag(r.title) || r.title;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.id}</TableCell>
                      <TableCell className="max-w-[260px]">
                        {r.title && (
                          <p className="text-sm font-medium">
                            {isRetestForError && <Badge variant="outline" className="mr-1 text-[10px]">Retest</Badge>}
                            {displayTitle}
                          </p>
                        )}
                        {r.module && <p className="text-xs text-muted-foreground">{r.module}</p>}
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
                      <TableCell className="text-xs">{r.tax_year ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {r.due_date ? (
                          <span>
                            {r.due_date}
                            {r.due_time && <span className="ml-1 text-muted-foreground">{r.due_time.slice(0,5)}</span>}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          if (r.status === "Completed") {
                            return <Badge variant="outline" className="text-[10px]">Completed</Badge>;
                          }
                          const info = deadlineInfo(r.deadline_at, now);
                          if (info.tier === "none") return <span className="text-xs text-muted-foreground">—</span>;
                          return (
                            <span className={cn(
                              "inline-block rounded border px-2 py-0.5 text-[11px] font-mono tabular-nums",
                              TIER_CLASSES[info.tier],
                            )}>
                              {info.isOverdue ? `Overdue +${info.shortLabel}` : info.shortLabel}
                            </span>
                          );
                        })()}
                      </TableCell>
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
                        <div className="inline-flex items-center gap-1">
                          {canSubmitRetest && (
                            <Button size="sm" onClick={() => { setSubmitTarget(r); setSubmitOpen(true); }}>
                              <ClipboardList className="mr-1 h-3 w-3" /> Submit result
                            </Button>
                          )}
                          <Button asChild size="sm" variant="outline">
                            <Link
                              to={routeForModule(r.module)}
                              search={(r.forms[0]?.form_name
                                ? { q: r.forms[0].form_name, assignment: r.id }
                                : { assignment: r.id }) as never}
                            >
                              <ExternalLink className="mr-1 h-3 w-3" /> Open
                            </Link>
                          </Button>
                          {isAdmin && r.status !== "Completed" && (
                            <Button size="sm" variant="ghost" onClick={async () => {
                              const res = await updateAssignment(r.id, { status: "Completed" });
                              if (!res.ok) toast.error(res.error); else toast.success("Marked completed");
                            }}>Mark completed</Button>
                          )}
                        </div>
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