import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  ScrollText,
  RefreshCw,
  Download,
  Activity,
  ShieldAlert,
  LogIn,
  Bug,
  ClipboardList,
  UserCog,
  Users,
  Clock,
} from "lucide-react";
import { exportXlsx } from "@/lib/qa/export";
import {
  matchesAuditAction,
  type AuditActionKind,
  type AuditRecordKind,
} from "@/lib/qa/adminFilters";

export const Route = createFileRoute("/_app/audit-log")({
  component: AuditLogPage,
});

export type ActivityRow = {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  category: string;
  action: string;
  record_type: string | null;
  record_id: string | null;
  defect_id: string | null;
  task_id: string | null;
  form_name: string | null;
  tax_year: string | null;
  environment: string | null;
  summary: string | null;
  old_value: unknown;
  new_value: unknown;
  result: string;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
  metadata: unknown;
};

const CATEGORIES = [
  { value: "all", label: "All categories" },
  { value: "defect", label: "Defects" },
  { value: "task", label: "Tasks" },
  { value: "comment", label: "Comments" },
  { value: "auth", label: "Auth" },
  { value: "user_mgmt", label: "User management" },
  { value: "role", label: "Roles" },
  { value: "export", label: "Exports" },
] as const;

const CAT_STYLES: Record<string, string> = {
  defect: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  task: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  comment: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  auth: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  user_mgmt: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  role: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  export: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  system: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

function browserOf(ua: string | null | undefined): string {
  if (!ua) return "—";
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return "Safari";
  if (/firefox\//i.test(ua)) return "Firefox";
  return ua.split(" ").pop() ?? "—";
}

function AuditLogPage() {
  const { currentUser } = useQA();
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [role, setRole] = useState<string>("all");
  const [actor, setActor] = useState<string>("all");
  const [recordKind, setRecordKind] = useState<AuditRecordKind>("any");
  const [actionKind, setActionKind] = useState<AuditActionKind>("any");
  const [defectId, setDefectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [taxYear, setTaxYear] = useState("");
  const [form, setForm] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [selected, setSelected] = useState<ActivityRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("activity_log" as never)
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      setRows((data ?? []) as unknown as ActivityRow[]);
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
      .channel(`activity-log-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        (payload) => {
          const r = payload.new as unknown as ActivityRow;
          setRows((prev) => [r, ...prev].slice(0, 2000));
        },
      )
      .subscribe();
    return () => {
      try {
        void supabase.removeChannel(ch);
      } catch {
        /* noop */
      }
    };
  }, [currentUser?.role, load]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const d = defectId.trim().toLowerCase();
    const t = taskId.trim().toLowerCase();
    const ty = taxYear.trim();
    const f = form.trim().toLowerCase();
    const fromTs = from ? new Date(from).getTime() : null;
    const toTs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    const out = rows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (role !== "all" && (r.actor_role ?? "") !== role) return false;
      if (actor !== "all" && (r.actor_name ?? "") !== actor) return false;
      if (recordKind !== "any") {
        const rt = (r.record_type ?? r.category ?? "").toLowerCase();
        if (rt !== recordKind) return false;
      }
      if (!matchesAuditAction(r.action, actionKind)) return false;
      if (d && !(r.defect_id ?? "").toLowerCase().includes(d)) return false;
      if (t && !(r.task_id ?? "").toLowerCase().includes(t)) return false;
      if (ty && (r.tax_year ?? "") !== ty) return false;
      if (f && !(r.form_name ?? "").toLowerCase().includes(f)) return false;
      if (s) {
        const hay = [r.summary, r.actor_name, r.actor_email, r.action, r.record_id]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(s)) return false;
      }
      const ts = new Date(r.occurred_at).getTime();
      if (fromTs && ts < fromTs) return false;
      if (toTs && ts > toTs) return false;
      return true;
    });
    out.sort((a, b) => {
      const av = new Date(a.occurred_at).getTime();
      const bv = new Date(b.occurred_at).getTime();
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return out;
  }, [
    rows,
    search,
    category,
    role,
    actor,
    recordKind,
    actionKind,
    defectId,
    taskId,
    taxYear,
    form,
    from,
    to,
    sortDir,
  ]);

  const actors = useMemo(
    () => Array.from(new Set(rows.map((r) => r.actor_name ?? "").filter(Boolean))).sort(),
    [rows],
  );

  const metrics = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const counts = {
      total: rows.length,
      today: 0,
      agent: 0,
      admin: 0,
      login: 0,
      defect: 0,
      task: 0,
      failed: 0,
    };
    for (const r of rows) {
      if (new Date(r.occurred_at) >= todayStart) counts.today++;
      if (r.actor_role === "agent") counts.agent++;
      if (r.actor_role === "admin") counts.admin++;
      if (r.category === "defect") counts.defect++;
      if (r.category === "task") counts.task++;
      if (r.action === "auth.login") counts.login++;
      if (r.result === "failure") counts.failed++;
    }
    return counts;
  }, [rows]);

  const onExport = (kind: "xlsx" | "csv") => {
    const fileName = `audit-log-${new Date().toISOString().slice(0, 10)}.${kind}`;
    const sheetRows = filtered.map((r) => ({
      Time: new Date(r.occurred_at).toLocaleString(),
      Actor: r.actor_name ?? "",
      Email: r.actor_email ?? "",
      Role: r.actor_role ?? "",
      Category: r.category,
      Action: r.action,
      Summary: r.summary ?? "",
      "Record ID": r.record_id ?? "",
      "Defect ID": r.defect_id ?? "",
      "Task ID": r.task_id ?? "",
      Form: r.form_name ?? "",
      "Tax Year": r.tax_year ?? "",
      Environment: r.environment ?? "",
      Previous: r.old_value ? JSON.stringify(r.old_value) : "",
      New: r.new_value ? JSON.stringify(r.new_value) : "",
      Result: r.result,
      IP: r.ip_address ?? "",
      Browser: browserOf(r.user_agent),
    }));
    if (kind === "xlsx") {
      exportXlsx(fileName, [{ name: "Audit Log", rows: sheetRows }], { title: "Admin Audit Log" });
      return;
    }
    const cols = sheetRows.length ? Object.keys(sheetRows[0]) : [];
    const csv = [
      cols.join(","),
      ...sheetRows.map((r) =>
        cols.map((c) => JSON.stringify((r as Record<string, unknown>)[c] ?? "")).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (currentUser && currentUser.role !== "admin") {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ScrollText className="h-6 w-6" /> Admin Audit Log
          </h1>
          <p className="text-sm text-muted-foreground">
            Complete activity trail — defects, tasks, comments, auth, user management, roles &
            exports. Updates in real-time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport("csv")}
            disabled={!filtered.length}
          >
            <Download className="h-4 w-4 mr-1.5" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExport("xlsx")}
            disabled={!filtered.length}
          >
            <Download className="h-4 w-4 mr-1.5" /> XLSX
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <MetricTile
          icon={<Activity className="h-4 w-4" />}
          label="Total events"
          value={metrics.total}
          onClick={() => setCategory("all")}
        />
        <MetricTile icon={<Clock className="h-4 w-4" />} label="Today" value={metrics.today} />
        <MetricTile
          icon={<Users className="h-4 w-4" />}
          label="Agent actions"
          value={metrics.agent}
          onClick={() => setRole("agent")}
        />
        <MetricTile
          icon={<UserCog className="h-4 w-4" />}
          label="Admin actions"
          value={metrics.admin}
          onClick={() => setRole("admin")}
        />
        <MetricTile
          icon={<LogIn className="h-4 w-4" />}
          label="Logins"
          value={metrics.login}
          onClick={() => {
            setCategory("auth");
          }}
        />
        <MetricTile
          icon={<Bug className="h-4 w-4" />}
          label="Defects"
          value={metrics.defect}
          onClick={() => setCategory("defect")}
        />
        <MetricTile
          icon={<ClipboardList className="h-4 w-4" />}
          label="Tasks"
          value={metrics.task}
          onClick={() => setCategory("task")}
        />
        <MetricTile
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Failures"
          value={metrics.failed}
          tone="destructive"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Search by user, action, defect, task, form, date range and more.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Input
              placeholder="Search user, action, summary…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actor} onValueChange={setActor}>
              <SelectTrigger>
                <SelectValue placeholder="Actor" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All actors</SelectItem>
                {actors.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={recordKind} onValueChange={(v) => setRecordKind(v as AuditRecordKind)}>
              <SelectTrigger>
                <SelectValue placeholder="Record type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All record types</SelectItem>
                <SelectItem value="defect">Defects</SelectItem>
                <SelectItem value="task">Tasks</SelectItem>
                <SelectItem value="comment">Comments</SelectItem>
                <SelectItem value="user">Users</SelectItem>
                <SelectItem value="export">Exports</SelectItem>
                <SelectItem value="role">Roles</SelectItem>
              </SelectContent>
            </Select>
            <Select value={actionKind} onValueChange={(v) => setActionKind(v as AuditActionKind)}>
              <SelectTrigger>
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">All actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="assign">Assign / Reassign</SelectItem>
                <SelectItem value="close">Close / Complete</SelectItem>
                <SelectItem value="reopen">Reopen</SelectItem>
                <SelectItem value="export">Export</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="comment">Comment</SelectItem>
                <SelectItem value="auth">Auth</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Defect ID (e.g. ZEN-2026-01)"
              value={defectId}
              onChange={(e) => setDefectId(e.target.value)}
            />
            <Input
              placeholder="Task ID"
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
            />
            <Input
              placeholder="Tax year (e.g. 2026)"
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value)}
            />
            <Input
              placeholder="Form name contains…"
              value={form}
              onChange={(e) => setForm(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From date"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To date"
              />
            </div>
          </div>
          {(search ||
            category !== "all" ||
            role !== "all" ||
            actor !== "all" ||
            recordKind !== "any" ||
            actionKind !== "any" ||
            defectId ||
            taskId ||
            taxYear ||
            form ||
            from ||
            to) && (
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                  setRole("all");
                  setActor("all");
                  setRecordKind("any");
                  setActionKind("any");
                  setDefectId("");
                  setTaskId("");
                  setTaxYear("");
                  setForm("");
                  setFrom("");
                  setTo("");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Events{" "}
            <span className="text-muted-foreground font-normal">
              ({filtered.length.toLocaleString()})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="w-[170px] cursor-pointer select-none"
                    onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                    aria-sort={sortDir === "desc" ? "descending" : "ascending"}
                    title="Toggle sort by Created / Updated Date"
                  >
                    Created / Updated {sortDir === "desc" ? "↓" : "↑"}
                  </TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Form / Year</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-sm text-muted-foreground py-10"
                    >
                      {loading ? "Loading…" : "No audit events match these filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(r.occurred_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{r.actor_name ?? "System"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.actor_email ?? ""}
                          {r.actor_role ? ` · ${r.actor_role}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={CAT_STYLES[r.category] ?? CAT_STYLES.system}
                        >
                          {r.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{r.action}</TableCell>
                      <TableCell className="text-xs">
                        {r.defect_id ?? r.task_id ?? r.record_id ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.form_name ? (
                          <span>{r.form_name}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {r.tax_year ? (
                          <span className="text-muted-foreground"> · {r.tax_year}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[28rem] truncate">{r.summary ?? ""}</TableCell>
                      <TableCell>
                        {r.result === "failure" ? (
                          <Badge
                            variant="outline"
                            className="bg-red-500/15 text-red-700 dark:text-red-300"
                          >
                            failure
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          >
                            success
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={CAT_STYLES[selected.category] ?? CAT_STYLES.system}
                  >
                    {selected.category}
                  </Badge>
                  <span className="font-mono text-sm">{selected.action}</span>
                </SheetTitle>
                <SheetDescription>{selected.summary}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <KV k="Time" v={new Date(selected.occurred_at).toLocaleString()} />
                <KV
                  k="Actor"
                  v={`${selected.actor_name ?? "System"}${selected.actor_email ? ` <${selected.actor_email}>` : ""}`}
                />
                <KV k="Role" v={selected.actor_role ?? "—"} />
                <KV
                  k="Record"
                  v={selected.record_id ?? selected.defect_id ?? selected.task_id ?? "—"}
                />
                <KV
                  k="Form / Year"
                  v={`${selected.form_name ?? "—"} · ${selected.tax_year ?? "—"}`}
                />
                <KV k="Environment" v={selected.environment ?? "—"} />
                <KV k="Result" v={selected.result} />
                <KV k="IP" v={selected.ip_address ?? "—"} />
                <KV k="Browser" v={browserOf(selected.user_agent)} />
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Previous</div>
                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-auto max-h-64">
                      {selected.old_value ? JSON.stringify(selected.old_value, null, 2) : "—"}
                    </pre>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">New</div>
                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-auto max-h-64">
                      {selected.new_value ? JSON.stringify(selected.new_value, null, 2) : "—"}
                    </pre>
                  </div>
                </div>
                {selected.metadata ? (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Metadata</div>
                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-auto max-h-48">
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onClick?: () => void;
  tone?: "default" | "destructive";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition hover:shadow-sm hover:border-foreground/20 ${tone === "destructive" ? "bg-red-500/5 border-red-500/30" : "bg-card"}`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={`mt-1 text-2xl font-semibold ${tone === "destructive" ? "text-red-600 dark:text-red-400" : ""}`}
      >
        {value.toLocaleString()}
      </div>
    </button>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
      <div className="text-muted-foreground">{k}</div>
      <div className="font-medium break-words">{v}</div>
    </div>
  );
}
