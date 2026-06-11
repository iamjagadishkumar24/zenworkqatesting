import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { scopeForUser, filterByEnvironment } from "@/lib/qa/scope";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DefectStatusBadge, PriorityBadge } from "@/components/qa/StatusBadge";
import { DefectDetailSheet } from "@/components/qa/DefectDetailSheet";
import { ExportMenu } from "@/components/qa/ExportMenu";
import { Eye, Pencil, Search, Bug, Trash2 } from "lucide-react";
import type { DefectStatus, Module, Priority, Severity } from "@/lib/qa/types";
import { AGENTS } from "@/lib/qa/constants";
import { toast } from "sonner";
import { validateFilters, buildEmptyResultMessage } from "@/lib/qa/filterValidation";

const DEFECT_STATUSES: DefectStatus[] = ["Reported","Pending","Ongoing","In Progress","Fixed","Retest Required","Reopened","Closed"];
const PRIORITIES: Priority[] = ["Low","Medium","High","Critical"];
const SEVERITIES: Severity[] = ["Low","Medium","High","Critical"];
const MODULES: Module[] = ["1099 Forms","990 Forms","Integrations","1099 Online"];

export const Route = createFileRoute("/_app/my-reported-errors")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: ReportedErrorsPage,
});

function ReportedErrorsPage() {
  const { defects, currentUser, deleteDefect } = useQA();
  const { env } = useEnvironment();
  const search = Route.useSearch();
  const isAdmin = currentUser?.role === "admin";

  const [q, setQ] = useState(search.q ?? "");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mod, setMod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [prio, setPrio] = useState<string>("all");
  const [sev, setSev] = useState<string>("all");
  const [agent, setAgent] = useState<string>("all");
  const [reporter, setReporter] = useState<string>("all");

  // Scope: admins see everything; agents see only their reported errors.
  const scoped = useMemo(() => {
    const byUser = scopeForUser(defects, currentUser ? { name: currentUser.name, role: currentUser.role } : null);
    return filterByEnvironment(byUser, env);
  }, [defects, currentUser, env]);

  const reporters = useMemo(
    () => Array.from(new Set(defects.map((d) => d.createdBy).filter(Boolean))).sort(),
    [defects],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return scoped.filter((d) => {
      if (mod !== "all" && d.module !== mod) return false;
      if (status !== "all" && d.status !== status) return false;
      if (prio !== "all" && d.priority !== prio) return false;
      if (sev !== "all" && d.severity !== sev) return false;
      if (agent !== "all" && d.assignedAgent !== agent) return false;
      if (reporter !== "all" && d.createdBy !== reporter) return false;
      if (!term) return true;
      return [d.id, d.title, d.formFeature, d.module, d.status, d.priority, d.severity, d.assignedAgent, d.createdBy]
        .join(" ").toLowerCase().includes(term);
    });
  }, [scoped, q, mod, status, prio, sev, agent, reporter]);

  const resetFilters = () => {
    setQ(""); setMod("all"); setStatus("all"); setPrio("all"); setSev("all"); setAgent("all"); setReporter("all");
  };

  const lastToastRef = useRef<string>("");
  useEffect(() => {
    const filters = { q, module: mod, status, priority: prio, severity: sev, assignedAgent: agent };
    const warnings = validateFilters(filters, scoped);
    if (warnings.length) {
      const key = "warn:" + warnings.join("|");
      if (key !== lastToastRef.current) {
        lastToastRef.current = key;
        warnings.forEach((w) => toast.warning(w));
      }
      return;
    }
    if (filtered.length === 0 && scoped.length > 0) {
      const msg = buildEmptyResultMessage(filters, warnings);
      const key = "empty:" + msg;
      if (key !== lastToastRef.current) {
        lastToastRef.current = key;
        toast.info(msg);
      }
    } else {
      lastToastRef.current = "";
    }
  }, [q, mod, status, prio, sev, agent, filtered.length, scoped]);

  const title = isAdmin ? "Reported Errors" : "My Reported Errors";
  const description = isAdmin
    ? "All defects reported across agents. Use filters to drill down."
    : "Errors you reported. Other agents' reports are not shown.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description} {filtered.length} shown.</p>
        </div>
        <ExportMenu
          filename="reported-errors"
          title="Reported errors export"
          filters={{ Scope: isAdmin ? "All" : (currentUser?.name ?? "—"), Environment: env ?? "All", Count: filtered.length }}
          rows={filtered.map(({ comments, ...d }) => ({ ...d, commentsCount: comments.length }))}
          columns={["id","module","formFeature","title","status","priority","severity","validity","assignedAgent","createdBy","environment","updatedAt"]}
          defaultSelected={["id","module","formFeature","title","status","priority","validity","createdBy","updatedAt"]}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-7">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
            </div>
            <FilterSelect value={mod} onChange={setMod} placeholder="Module" options={[{ v: "all", l: "All modules" }, ...MODULES.map((m) => ({ v: m, l: m }))]} />
            <FilterSelect value={status} onChange={setStatus} placeholder="Status" options={[{ v: "all", l: "All statuses" }, ...DEFECT_STATUSES.map((s) => ({ v: s, l: s }))]} />
            <FilterSelect value={prio} onChange={setPrio} placeholder="Priority" options={[{ v: "all", l: "All priorities" }, ...PRIORITIES.map((p) => ({ v: p, l: p }))]} />
            <FilterSelect value={sev} onChange={setSev} placeholder="Severity" options={[{ v: "all", l: "All severities" }, ...SEVERITIES.map((p) => ({ v: p, l: p }))]} />
            {isAdmin && (
              <>
                <FilterSelect value={agent} onChange={setAgent} placeholder="Assigned"
                  options={[{ v: "all", l: "All agents" }, ...AGENTS.map((a) => ({ v: a, l: a }))]} />
                <FilterSelect value={reporter} onChange={setReporter} placeholder="Reported by"
                  options={[{ v: "all", l: "All reporters" }, ...reporters.map((a) => ({ v: a, l: a }))]} />
              </>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
            <Button size="sm" variant="ghost" onClick={resetFilters}>Reset filters</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Form / Feature</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Reported By</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => setOpenId(d.id)}>
                  <TableCell className="font-mono text-xs">{d.id}</TableCell>
                  <TableCell className="text-sm">{d.module}</TableCell>
                  <TableCell className="text-sm">{d.formFeature}</TableCell>
                  <TableCell className="max-w-[280px] truncate font-medium">{d.title}</TableCell>
                  <TableCell><DefectStatusBadge status={d.status} /></TableCell>
                  <TableCell><PriorityBadge value={d.priority} /></TableCell>
                  <TableCell className="text-sm">{d.createdBy}</TableCell>
                  <TableCell className="text-sm">{d.assignedAgent}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(d.updatedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpenId(d.id); }} aria-label="View">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(isAdmin || d.createdBy === currentUser?.name) && (
                        <Button size="icon" variant="ghost" aria-label="Edit"
                          onClick={(e) => { e.stopPropagation(); setEditId(d.id); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {(isAdmin || d.createdBy === currentUser?.name) && (
                        <Button size="icon" variant="ghost" aria-label="Delete"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteId(d.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                    <Bug className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    No reported errors match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DefectDetailSheet defectId={openId} open={!!openId} onOpenChange={(o) => { if (!o) setOpenId(null); }} />
      <DefectDetailSheet defectId={editId} open={!!editId} initialEdit onOpenChange={(o) => { if (!o) setEditId(null); }} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o && !deleting) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reported Error</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this reported error? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!deleteId) return;
                setDeleting(true);
                const res = await deleteDefect(deleteId);
                setDeleting(false);
                if (res.ok) {
                  toast.success("Reported error deleted");
                  setDeleteId(null);
                } else {
                  toast.error(res.error ?? "Failed to delete");
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterSelect({
  value, onChange, placeholder, options,
}: {
  value: string; onChange: (v: string) => void; placeholder: string;
  options: { v: string; l: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
    </Select>
  );
}
