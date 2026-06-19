import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { useRetests, RETEST_STATUSES, type RetestPriority, type RetestStatus } from "@/lib/qa/retest";
import {
  MODULE_OPTIONS,
  TAX_YEARS,
  DEFAULT_TAX_YEAR,
  getModuleCatalog,
} from "@/lib/qa/constants";
import { useAgentInvites } from "@/lib/qa/agents";
import { useServerFn } from "@tanstack/react-start";
import { sendTaskAssignmentEmail } from "@/lib/qa/email.functions";
import { validateAssignmentScope } from "@/lib/qa/assignmentValidation";
import { listAssignableFormsForModule } from "@/lib/qa/assignment.functions";

const PRIORITIES: RetestPriority[] = ["Low", "Medium", "High", "Critical"];
const ALL_MODULES = "All Modules";

export function AssignTaskDialog({
  open, onOpenChange, defaultAgent, defaultModule, defaultTitle,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultAgent?: string;
  defaultModule?: string;
  defaultTitle?: string;
}) {
  const { users, forms } = useQA();
  const { env } = useEnvironment();
  const { createAssignment } = useRetests();
  const { items: invites } = useAgentInvites();
  const notifyByEmail = useServerFn(sendTaskAssignmentEmail);
  const listForms = useServerFn(listAssignableFormsForModule);
  const agentNames = useMemo(
    () => users.filter((u) => u.active && u.role === "agent").map((u) => u.name),
    [users],
  );
  const pendingInvites = useMemo(
    () => invites.filter((i) => !i.user_id && i.status !== "inactive"),
    [invites],
  );
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [moduleSel, setModuleSel] = useState<string>(defaultModule ?? ALL_MODULES);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(() => new Set(defaultAgent ? [defaultAgent] : []));
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const [assignAll, setAssignAll] = useState(false);
  const [allForms, setAllForms] = useState(false);
  const [priority, setPriority] = useState<RetestPriority>("Medium");
  const [taxYear, setTaxYear] = useState<string>(DEFAULT_TAX_YEAR);
  const [status, setStatus] = useState<RetestStatus>("Pending");
  const [dueDate, setDueDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Strict server-backed listing. The Forms/Features picker shows ONLY what
  // the server returns for the selected module/category; the same canonical
  // catalog is enforced server-side at write time (Create / Edit / Reassign).
  const [serverForms, setServerForms] = useState<{ id: string; name: string; module: string }[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (!moduleSel || moduleSel === ALL_MODULES) {
      setServerForms([]);
      return;
    }
    setLoadingForms(true);
    listForms({ data: { module: moduleSel } })
      .then((rows) => { if (!cancelled) setServerForms(rows ?? []); })
      .catch(() => { if (!cancelled) setServerForms([]); })
      .finally(() => { if (!cancelled) setLoadingForms(false); });
    return () => { cancelled = true; };
  }, [open, moduleSel, listForms]);
  const scopedForms = useMemo(() => {
    if (!moduleSel || moduleSel === ALL_MODULES) {
      // "All Modules" only — no curated catalog; fall back to the local DB
      // form mirror so admins can still pick something. The server guard
      // never rejects in this case (unknown module = unrestricted).
      return forms;
    }
    return [...serverForms].sort((a, b) => a.name.localeCompare(b.name));
  }, [moduleSel, serverForms, forms]);
  // Defensive: if the module's catalog shrinks (or changes), drop any
  // picked ids that are no longer valid.
  useEffect(() => {
    if (!moduleSel || moduleSel === ALL_MODULES) return;
    const allowed = new Set(scopedForms.map((f) => f.id));
    setPicked((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [moduleSel, scopedForms]);
  const filtered = useMemo(
    () => scopedForms.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase())),
    [scopedForms, filter],
  );
  const [submitting, setSubmitting] = useState(false);
  // Inline server/client validation error surfaced in the dialog so the
  // admin sees exactly which forms/features are blocking the save. Cleared
  // when the user changes module or the picked selection.
  const [scopeError, setScopeError] = useState<{ message: string; offenders: string[] } | null>(null);
  useEffect(() => { setScopeError(null); }, [moduleSel, picked, allForms]);

  const submit = async () => {
    if (!title.trim()) return toast.error("Task title is required");
    if (!assignAll && selectedAgents.size === 0 && selectedPending.size === 0) {
      return toast.error("Select at least one agent or 'Assign to all'");
    }
    setScopeError(null);
    const scopeCheck = validateAssignmentScope({
      module: moduleSel,
      allForms,
      pickedIds: picked,
      availableForms: scopedForms,
      allForms_catalog: forms,
    });
    if (!scopeCheck.ok) {
      setScopeError({ message: scopeCheck.error, offenders: scopeCheck.offenders });
      return toast.error(scopeCheck.error);
    }
    setSubmitting(true);
    const selected = allForms
      ? []
      : scopedForms
          .filter((f) => picked.has(f.id))
          .map((f) => ({ id: f.id, name: f.name }));
    const r = await createAssignment({
      agentNames: assignAll ? [] : Array.from(selectedAgents),
      assignToAll: assignAll,
      pendingEmails: Array.from(selectedPending),
      allForms,
      forms: selected,
      instructions,
      priority,
      dueDate: dueDate || null,
      title: title.trim(),
      module: moduleSel,
      taxYear,
    });
    setSubmitting(false);
    if (!r.ok) {
      const offenders = Array.isArray((r as { offenders?: unknown }).offenders)
        ? ((r as { offenders: string[] }).offenders)
        : [];
      setScopeError({ message: r.error, offenders });
      return toast.error(r.error);
    }

    // Build recipient list (active agents who got a real assignment) + pending invites.
    const targetUsers = assignAll
      ? users.filter((u) => u.active && u.role === "agent")
      : users.filter((u) => selectedAgents.has(u.name));
    const recipients = [
      ...targetUsers
        .filter((u) => !!u.email)
        .map((u) => ({ email: u.email, name: u.name })),
      ...Array.from(selectedPending).map((email) => ({ email })),
    ];
    const firstId = r.ids?.[0] ?? "";

    let emailNotice = "";
    if (recipients.length && firstId) {
      try {
        const res = await notifyByEmail({
          data: {
            recipients,
            task: {
              id: firstId,
              title: title.trim(),
              module: moduleSel,
              priority,
              dueDate: dueDate || null,
              instructions,
              environment: env ?? undefined,
            },
          },
        });
        if (!res.configured) {
          emailNotice = " Email notification is not configured yet.";
        } else if (res.failed > 0 && res.sent === 0) {
          emailNotice = " Email notification failed.";
        } else if (res.failed > 0) {
          emailNotice = ` Email sent to ${res.sent}/${res.total} agents.`;
        } else {
          emailNotice = ` Email sent to ${res.sent} agent${res.sent === 1 ? "" : "s"}.`;
        }
      } catch {
        emailNotice = " Email notification could not be triggered.";
      }
    }

    const baseMsg = assignAll
      ? "Task assigned to all active agents."
      : selectedPending.size > 0
        ? "Task assigned (pending agents receive it on signup)."
        : "Task assigned successfully.";
    toast.success(baseMsg + emailNotice);
    onOpenChange(false);
    setTitle(""); setPicked(new Set()); setInstructions(""); setDueDate("");
    setAssignAll(false); setAllForms(false);
    setSelectedAgents(new Set()); setSelectedPending(new Set());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Task</DialogTitle>
          <DialogDescription>
            Assign a testing task to a single agent or to all active agents in the current environment ({env ?? "—"}).
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Task title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Verify 2290 e-file flow" />
          </div>
          <div>
            <Label>Module / Category</Label>
            <Select value={moduleSel} onValueChange={(v) => { setModuleSel(v); setPicked(new Set()); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ALL_MODULES}>All Modules (every form/feature)</SelectItem>
                {MODULE_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Agents ({selectedAgents.size + selectedPending.size} selected)</Label>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <Checkbox checked={assignAll} onCheckedChange={(c) => setAssignAll(!!c)} />
              <span>Assign to all active agents</span>
            </label>
            {!assignAll && (
              <div className="mt-2 max-h-40 overflow-auto rounded-md border p-2 grid gap-1 sm:grid-cols-2">
                {agentNames.length === 0 && <p className="text-xs text-muted-foreground">No active agents found.</p>}
                {agentNames.map((a) => {
                  const checked = selectedAgents.has(a);
                  return (
                    <label key={a} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted text-sm">
                      <Checkbox checked={checked} onCheckedChange={(c) => {
                        setSelectedAgents((s) => { const n = new Set(s); if (c) n.add(a); else n.delete(a); return n; });
                      }} />
                      <span className="truncate">{a}</span>
                    </label>
                  );
                })}
                {pendingInvites.length > 0 && (
                  <div className="sm:col-span-2 mt-1 border-t pt-1 text-xs uppercase tracking-wide text-muted-foreground">
                    Pending agents (pre-assign)
                  </div>
                )}
                {pendingInvites.map((p) => {
                  const checked = selectedPending.has(p.email);
                  return (
                    <label key={p.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted text-sm">
                      <Checkbox checked={checked} onCheckedChange={(c) => {
                        setSelectedPending((s) => { const n = new Set(s); if (c) n.add(p.email); else n.delete(p.email); return n; });
                      }} />
                      <span className="truncate">{p.name} <span className="text-muted-foreground">({p.email})</span></span>
                    </label>
                  );
                })}
              </div>
            )}
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
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as RetestStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RETEST_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Environment</Label>
            <Input value={env ?? "Production"} readOnly disabled />
          </div>
          <div>
            <Label>Tax Year *</Label>
            <Select value={taxYear} onValueChange={setTaxYear}>
              <SelectTrigger><SelectValue placeholder="Select Tax Year" /></SelectTrigger>
              <SelectContent>{TAX_YEARS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Filter forms / features (optional)</Label>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search by name…" />
            <label className="mt-2 flex items-center gap-2 text-sm">
              <Checkbox checked={allForms} onCheckedChange={(c) => setAllForms(!!c)} />
              <span>All Forms (assign every form in the catalog)</span>
            </label>
          </div>
          <div className="md:col-span-2">
            <Label>Forms / features ({picked.size} selected, optional)</Label>
            {!allForms && filtered.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      filtered.forEach((f) => n.add(f.id));
                      return n;
                    })
                  }
                >
                  Select all{filter ? " (filtered)" : ""}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPicked(new Set())}
                  disabled={picked.size === 0}
                >
                  Clear selection
                </Button>
              </div>
            )}
            <div className={`mt-1 max-h-48 overflow-auto rounded-md border p-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3 ${allForms ? "opacity-50 pointer-events-none" : ""}`}>
              {loadingForms && (
                <p className="text-xs text-muted-foreground">Loading forms…</p>
              )}
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
              {!loadingForms && filtered.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {moduleSel && moduleSel !== ALL_MODULES && !getModuleCatalog(moduleSel)
                    ? "No forms/features are mapped to this module."
                    : "No forms match."}
                </p>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Description / instructions</Label>
            <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Assigning…" : "Assign Task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}