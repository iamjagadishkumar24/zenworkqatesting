import { useMemo, useState } from "react";
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
import { useRetests, TESTING_TYPES, RETEST_STATUSES, type RetestPriority, type RetestStatus } from "@/lib/qa/retest";
import { MODULE_OPTIONS } from "@/lib/qa/constants";
import { useAgentInvites } from "@/lib/qa/agents";

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
  const [testingType, setTestingType] = useState<string>(TESTING_TYPES[0] ?? "Retest");
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(() => new Set(defaultAgent ? [defaultAgent] : []));
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const [assignAll, setAssignAll] = useState(false);
  const [allForms, setAllForms] = useState(false);
  const [priority, setPriority] = useState<RetestPriority>("Medium");
  const [status, setStatus] = useState<RetestStatus>("Pending");
  const [dueDate, setDueDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const scopedForms = useMemo(
    () => (moduleSel && moduleSel !== ALL_MODULES ? forms.filter((f) => f.module === moduleSel) : forms),
    [forms, moduleSel],
  );
  const filtered = useMemo(
    () => scopedForms.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase())),
    [scopedForms, filter],
  );
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim()) return toast.error("Task title is required");
    if (!assignAll && selectedAgents.size === 0 && selectedPending.size === 0) {
      return toast.error("Select at least one agent or 'Assign to all'");
    }
    setSubmitting(true);
    const selected = allForms ? [] : forms.filter((f) => picked.has(f.id));
    const r = await createAssignment({
      agentNames: assignAll ? [] : Array.from(selectedAgents),
      assignToAll: assignAll,
      pendingEmails: Array.from(selectedPending),
      allForms,
      forms: selected,
      instructions,
      priority,
      dueDate: dueDate || null,
      testingType,
      title: title.trim(),
      module: moduleSel,
    });
    setSubmitting(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(
      assignAll ? "Task assigned to all active agents"
        : selectedPending.size > 0 ? "Task assigned (pending agents receive it on signup)"
        : "Task assigned",
    );
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
          <div>
            <Label>Testing type</Label>
            <Select value={testingType} onValueChange={setTestingType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TESTING_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
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
            <div className={`mt-1 max-h-48 overflow-auto rounded-md border p-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3 ${allForms ? "opacity-50 pointer-events-none" : ""}`}>
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