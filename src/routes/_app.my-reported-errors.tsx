import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { useTaxYear, matchesTaxYear } from "@/lib/qa/taxYear";
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
import { Eye, Pencil, Search, Bug, Trash2, UserPlus, Download } from "lucide-react";
import { ExportPreviewDialog } from "@/components/qa/ExportPreviewDialog";
import { useAllowAgentExports } from "@/lib/qa/useExportJob";
import type { DefectStatus, Priority } from "@/lib/qa/types";
import { AGENTS, MODULE_OPTIONS } from "@/lib/qa/constants";
import { toast } from "sonner";
import { validateFilters, buildEmptyResultMessage } from "@/lib/qa/filterValidation";

const DEFECT_STATUSES: DefectStatus[] = ["Reported","Pending","Ongoing","In Progress","Fixed","Retest Required","Reopened","Closed"];
const PRIORITIES: Priority[] = ["Low","Medium","High","Critical"];
const MODULES: string[] = MODULE_OPTIONS;

export const Route = createFileRoute("/_app/my-reported-errors")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: ReportedErrorsPage,
});

function ReportedErrorsPage() {
  const { defects, currentUser, deleteDefect, updateDefect } = useQA();
  const { env } = useEnvironment();
  const { taxYear } = useTaxYear();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === "admin";

  // URL `?q=` is the single source of truth. Input mirrors it with debounce.
  const q = search.q ?? "";
  const [qInput, setQInput] = useState(q);
  // Keep local input in sync when URL changes externally (header search, reset, nav).
  useEffect(() => { setQInput(q); }, [q]);
  // Debounced write-through from input -> URL.
  useEffect(() => {
    const trimmed = qInput.trim();
    if (trimmed === (search.q ?? "")) return;
    const t = setTimeout(() => {
      navigate({
        to: "/my-reported-errors",
        search: trimmed ? { q: trimmed } : ({} as never),
        replace: true,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [qInput, search.q, navigate]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mod, setMod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [prio, setPrio] = useState<string>("all");
  const [agent, setAgent] = useState<string>("all");
  const [reporter, setReporter] = useState<string>("all");
  const [reassignFor, setReassignFor] = useState<{ id: string; current: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const allowAgentExports = useAllowAgentExports();
  const canExport = isAdmin || allowAgentExports === true;

  // Scope: admins see everything; agents see only their reported errors.
  const scoped = useMemo(() => {
    const byUser = scopeForUser(defects, currentUser ? { name: currentUser.name, role: currentUser.role } : null);
    const byEnv = filterByEnvironment(byUser, env);
    return byEnv.filter((d) => matchesTaxYear(d.taxYear, taxYear));
  }, [defects, currentUser, env, taxYear]);

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
      if (agent !== "all" && d.assignedAgent !== agent) return false;
      if (reporter !== "all" && d.createdBy !== reporter) return false;
      if (!term) return true;
      return [d.id, d.title, d.formFeature, d.module, d.status, d.priority, d.assignedAgent, d.createdBy]
        .join(" ").toLowerCase().includes(term);
    });
  }, [scoped, q, mod, status, prio, agent, reporter]);

  const resetFilters = () => {
    setQInput("");
    setMod("all"); setStatus("all"); setPrio("all"); setAgent("all"); setReporter("all");
    navigate({ to: "/my-reported-errors", search: {} as never, replace: true });
  };

  const lastToastRef = useRef<string>("");
  useEffect(() => {
    const filters = { q, module: mod, status, priority: prio, assignedAgent: agent };
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
  }, [q, mod, status, prio, agent, filtered.length, scoped]);

  const title = isAdmin ? "Reported Errors" : "My Reported Errors";
  const description = isAdmin
    ? "All errors reported across agents. Use filters to drill down."
    : "Errors you reported. Other agents' reports are not shown.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description} {filtered.length} shown.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportOpen(true)}
              disabled={!filtered.length}
            >
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-7">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search…"
                className="pl-9"
              />
            </div>
            <FilterSelect value={mod} onChange={setMod} placeholder="Module" options={[{ v: "all", l: "All modules" }, ...MODULES.map((m) => ({ v: m, l: m }))]} />
            <FilterSelect value={status} onChange={setStatus} placeholder="Status" options={[{ v: "all", l: "All statuses" }, ...DEFECT_STATUSES.map((s) => ({ v: s, l: s }))]} />
            <FilterSelect value={prio} onChange={setPrio} placeholder="Priority" options={[{ v: "all", l: "All priorities" }, ...PRIORITIES.map((p) => ({ v: p, l: p }))]} />
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
                <TableHead>Tax Year</TableHead>
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
                  <TableCell className="text-xs">{d.taxYear ?? "—"}</TableCell>
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
                      {isAdmin && (
                        <Button size="icon" variant="ghost" aria-label="Assign / Reassign"
                          onClick={(e) => { e.stopPropagation(); setReassignFor({ id: d.id, current: d.assignedAgent }); }}>
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      )}
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

      <ExportPreviewDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        rows={filtered}
        environment={env}
        isAdmin={isAdmin}
        filters={{
          environment: env,
          taxYear: taxYear === "all" ? undefined : taxYear,
          module: mod,
          status,
          priority: prio,
          assignedAgent: agent,
          reporter,
          q,
        }}
      />

      {isAdmin && reassignFor && (
        <ReassignDialog
          open={!!reassignFor}
          current={reassignFor.current}
          onOpenChange={(o) => { if (!o) setReassignFor(null); }}
          onConfirm={async (newAgent) => {
            const res = await updateDefect(reassignFor.id, { assignedAgent: newAgent });
            if (!res.ok) toast.error(res.error ?? "Reassign failed");
            else { toast.success(`Reassigned to ${newAgent}`); setReassignFor(null); }
          }}
        />
      )}

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

function ReassignDialog({
  open, current, onOpenChange, onConfirm,
}: {
  open: boolean; current: string;
  onOpenChange: (o: boolean) => void;
  onConfirm: (newAgent: string) => void | Promise<void>;
}) {
  const [pick, setPick] = useState(current);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Assign / Reassign defect</AlertDialogTitle>
          <AlertDialogDescription>
            Currently assigned to <span className="font-medium">{current || "—"}</span>. Choose a new agent.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {AGENTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); void onConfirm(pick); }}>
            Confirm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
