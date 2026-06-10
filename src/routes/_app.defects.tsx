import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DefectStatusBadge, PriorityBadge } from "@/components/qa/StatusBadge";
import { Bug, Plus, Search, Eye, Pencil, MessageSquare, Trash2 } from "lucide-react";
import type {
  Defect, DefectStatus, Module, Priority, Severity,
} from "@/lib/qa/types";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/defects")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : undefined,
    filter: typeof s.filter === "string" ? s.filter : undefined,
  }),
  component: DefectsPage,
});

const DEFECT_STATUSES: DefectStatus[] = [
  "Reported", "Pending", "Ongoing", "In Progress", "Fixed", "Retest Required", "Reopened", "Closed",
];
const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Critical"];
const SEVERITIES: Severity[] = ["Low", "Medium", "High", "Critical"];
const MODULES: Module[] = ["1099 Forms", "990 Forms", "Integrations", "1099 Online"];

const emptyDraft = (currentUser?: { name: string } | null): Omit<Defect, "id" | "createdAt" | "updatedAt" | "updatedBy" | "createdBy" | "comments"> => ({
  module: "1099 Forms",
  formFeature: "",
  title: "",
  description: "",
  stepsToReproduce: "",
  expectedResult: "",
  actualResult: "",
  attachmentUrl: "",
  jiraUrl: "",
  status: "Reported",
  priority: "Medium",
  severity: "Medium",
  assignedAgent: currentUser?.name ?? "",
});

function DefectsPage() {
  const { defects, addDefect, updateDefect, deleteDefect, addComment, currentUser, users } = useQA();
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q ?? "");
  const [mod, setMod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [prio, setPrio] = useState<string>("all");
  const [sev, setSev] = useState<string>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(currentUser));

  const [viewing, setViewing] = useState<Defect | null>(null);
  const [editing, setEditing] = useState<Defect | null>(null);
  const [editDraft, setEditDraft] = useState<Defect | null>(null);
  const [comment, setComment] = useState("");

  const isAdmin = currentUser?.role === "admin";

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return defects.filter((d) => {
      if (search.filter === "open" && ["Fixed", "Closed"].includes(d.status)) return false;
      if (search.filter === "failed" && d.status === "Closed") return false;
      if (mod !== "all" && d.module !== mod) return false;
      if (status !== "all" && d.status !== status) return false;
      if (prio !== "all" && d.priority !== prio) return false;
      if (sev !== "all" && d.severity !== sev) return false;
      if (!term) return true;
      return [d.id, d.title, d.formFeature, d.module, d.assignedAgent, d.status, d.priority, d.severity]
        .join(" ").toLowerCase().includes(term);
    });
  }, [defects, q, mod, status, prio, sev, search.filter]);

  const canEdit = (d: Defect) => isAdmin || d.assignedAgent === currentUser?.name || d.createdBy === currentUser?.name;

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.formFeature.trim()) return toast.error("Title and Form/Feature are required");
    addDefect(draft);
    toast.success("Defect created");
    setCreateOpen(false);
    setDraft(emptyDraft(currentUser));
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDraft) return;
    updateDefect(editDraft.id, editDraft);
    toast.success("Defect updated");
    setEditing(null);
    setEditDraft(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Defects</h2>
          <p className="text-sm text-muted-foreground">Jira-style defect tracking across all QA modules.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setDraft(emptyDraft(currentUser)); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> Add Defect</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Defect</DialogTitle>
              <DialogDescription>Capture all reproduction details so engineering can act fast.</DialogDescription>
            </DialogHeader>
            <DefectForm draft={draft} setDraft={setDraft} users={users} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={submitCreate}>Create Defect</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-6">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search defects…" className="pl-9" />
            </div>
            <FilterSelect value={mod} onChange={setMod} placeholder="Module" options={["all", ...MODULES]} />
            <FilterSelect value={status} onChange={setStatus} placeholder="Status" options={["all", ...DEFECT_STATUSES]} />
            <FilterSelect value={prio} onChange={setPrio} placeholder="Priority" options={["all", ...PRIORITIES]} />
            <FilterSelect value={sev} onChange={setSev} placeholder="Severity" options={["all", ...SEVERITIES]} />
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
                <TableHead>Severity</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.id}</TableCell>
                  <TableCell className="text-sm">{d.module}</TableCell>
                  <TableCell className="text-sm">{d.formFeature}</TableCell>
                  <TableCell className="max-w-[280px] truncate font-medium">{d.title}</TableCell>
                  <TableCell><DefectStatusBadge status={d.status} /></TableCell>
                  <TableCell><PriorityBadge value={d.priority} /></TableCell>
                  <TableCell><PriorityBadge value={d.severity} /></TableCell>
                  <TableCell className="text-sm">{d.assignedAgent}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(d.updatedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setViewing(d)} aria-label="View"><Eye className="h-4 w-4" /></Button>
                      <Button
                        size="icon" variant="ghost"
                        disabled={!canEdit(d)}
                        onClick={() => { setEditing(d); setEditDraft(d); }}
                        aria-label="Edit"
                      ><Pencil className="h-4 w-4" /></Button>
                      {isAdmin && (
                        <Button
                          size="icon" variant="ghost"
                          onClick={() => { if (confirm(`Delete ${d.id}?`)) { deleteDefect(d.id); toast.success("Defect deleted"); } }}
                          aria-label="Delete"
                        ><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                  <Bug className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No defects match the current filters.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">{viewing.id}</span>
                  <span>{viewing.title}</span>
                </DialogTitle>
                <DialogDescription className="flex flex-wrap gap-2 pt-2">
                  <DefectStatusBadge status={viewing.status} />
                  <PriorityBadge value={viewing.priority} />
                  <PriorityBadge value={viewing.severity} />
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <Field label="Module">{viewing.module} • {viewing.formFeature}</Field>
                <Field label="Description">{viewing.description}</Field>
                <Field label="Steps to Reproduce"><pre className="whitespace-pre-wrap font-sans">{viewing.stepsToReproduce}</pre></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Expected Result">{viewing.expectedResult}</Field>
                  <Field label="Actual Result">{viewing.actualResult}</Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 text-xs">
                  <Field label="Assigned Agent">{viewing.assignedAgent}</Field>
                  <Field label="Created By">{viewing.createdBy}</Field>
                  <Field label="Created">{new Date(viewing.createdAt).toLocaleString()}</Field>
                  <Field label="Updated">{new Date(viewing.updatedAt).toLocaleString()} by {viewing.updatedBy}</Field>
                </div>
                {viewing.jiraUrl && <Field label="Jira"><a className="text-primary underline" href={viewing.jiraUrl} target="_blank" rel="noreferrer">{viewing.jiraUrl}</a></Field>}

                <div>
                  <h4 className="mb-2 text-sm font-semibold">Comments</h4>
                  <div className="space-y-2">
                    {viewing.comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
                    {viewing.comments.map((c) => (
                      <div key={c.id} className="rounded-md border border-border bg-muted/40 p-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{c.author}</span>
                          <span>{new Date(c.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="mt-1 text-sm">{c.text}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!comment.trim()) return;
                        addComment(viewing.id, comment.trim());
                        setComment("");
                        // refresh viewing reference
                        setViewing((v) => v && { ...v });
                        toast.success("Comment added");
                      }}
                    ><MessageSquare className="mr-1 h-4 w-4" />Post</Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setEditDraft(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {editDraft && (
            <>
              <DialogHeader>
                <DialogTitle>Edit {editDraft.id}</DialogTitle>
                <DialogDescription>Update the defect details, status or assignment.</DialogDescription>
              </DialogHeader>
              <DefectForm
                draft={editDraft}
                setDraft={(p) => setEditDraft((d) => (d ? { ...d, ...(typeof p === "function" ? p(d) : p) } : d))}
                users={users}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => { setEditing(null); setEditDraft(null); }}>Cancel</Button>
                <Button onClick={submitEdit}>Save changes</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function FilterSelect({ value, onChange, placeholder, options }: { value: string; onChange: (v: string) => void; placeholder: string; options: string[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o} value={o}>{o === "all" ? `All ${placeholder}` : o}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function DefectForm<T extends Partial<Defect>>({
  draft, setDraft, users,
}: {
  draft: T;
  setDraft: (p: T | ((d: T) => T)) => void;
  users: { name: string }[];
}) {
  const upd = <K extends keyof T>(k: K, v: T[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label>Title</Label>
        <Input value={draft.title ?? ""} onChange={(e) => upd("title" as keyof T, e.target.value as T[keyof T])} />
      </div>
      <div>
        <Label>Module</Label>
        <Select value={draft.module as string} onValueChange={(v) => upd("module" as keyof T, v as T[keyof T])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Form / Feature</Label>
        <Input value={draft.formFeature ?? ""} onChange={(e) => upd("formFeature" as keyof T, e.target.value as T[keyof T])} />
      </div>
      <div>
        <Label>Status</Label>
        <Select value={draft.status as string} onValueChange={(v) => upd("status" as keyof T, v as T[keyof T])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{DEFECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Assigned Agent</Label>
        <Select value={draft.assignedAgent as string} onValueChange={(v) => upd("assignedAgent" as keyof T, v as T[keyof T])}>
          <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
          <SelectContent>{users.map((u) => <SelectItem key={u.name} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Priority</Label>
        <Select value={draft.priority as string} onValueChange={(v) => upd("priority" as keyof T, v as T[keyof T])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Severity</Label>
        <Select value={draft.severity as string} onValueChange={(v) => upd("severity" as keyof T, v as T[keyof T])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{SEVERITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label>Description</Label>
        <Textarea rows={2} value={draft.description ?? ""} onChange={(e) => upd("description" as keyof T, e.target.value as T[keyof T])} />
      </div>
      <div className="sm:col-span-2">
        <Label>Steps to Reproduce</Label>
        <Textarea rows={3} value={draft.stepsToReproduce ?? ""} onChange={(e) => upd("stepsToReproduce" as keyof T, e.target.value as T[keyof T])} />
      </div>
      <div>
        <Label>Expected Result</Label>
        <Textarea rows={2} value={draft.expectedResult ?? ""} onChange={(e) => upd("expectedResult" as keyof T, e.target.value as T[keyof T])} />
      </div>
      <div>
        <Label>Actual Result</Label>
        <Textarea rows={2} value={draft.actualResult ?? ""} onChange={(e) => upd("actualResult" as keyof T, e.target.value as T[keyof T])} />
      </div>
      <div>
        <Label>Attachment URL</Label>
        <Input value={draft.attachmentUrl ?? ""} onChange={(e) => upd("attachmentUrl" as keyof T, e.target.value as T[keyof T])} />
      </div>
      <div>
        <Label>Jira Ticket URL</Label>
        <Input value={draft.jiraUrl ?? ""} onChange={(e) => upd("jiraUrl" as keyof T, e.target.value as T[keyof T])} />
      </div>
    </div>
  );
}
