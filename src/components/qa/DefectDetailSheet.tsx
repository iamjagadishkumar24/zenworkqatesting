import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQA } from "@/lib/qa/store";
import type { Defect, DefectStatus, Priority, Severity } from "@/lib/qa/types";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DefectStatusBadge, PriorityBadge } from "./StatusBadge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, MessageSquare, History as HistoryIcon,
  Link as LinkIcon, ExternalLink, ShieldCheck, ShieldX,
  Activity as ActivityIcon, Pencil, UserPlus, Plus, MessageCircle, Check, X,
} from "lucide-react";

const STATUSES: DefectStatus[] = ["Reported","Pending","Ongoing","In Progress","Fixed","Retest Required","Reopened","Closed"];
const LEVELS: Priority[] = ["Low","Medium","High","Critical"];
const MODULES = ["1099 Forms","990 Forms","Integrations","1099 Online"] as const;

function moduleRoute(module: string): string {
  switch (module) {
    case "Integrations": return "/integrations";
    case "Chatbot": return "/chatbot-testing";
    case "Functionality": return "/functionality-testing";
    case "Tax1099": return "/tax1099-features";
    case "2290 Forms": return "/2290-forms";
    default: return "/forms";
  }
}

function historyLabel(field: string, oldVal: string | null, newVal: string | null): string {
  if (field === "comment") return "Edited a comment";
  if (field === "status") {
    if (newVal === "Closed") return "Closed defect";
    if (newVal === "Reopened") return "Reopened defect";
    if (newVal === "Fixed") return "Marked Fixed";
    if (newVal === "Retest Required") return "Requested retest";
    return `Status: ${oldVal ?? "—"} → ${newVal ?? "—"}`;
  }
  if (field === "assigned_agent") return `Assigned to ${newVal ?? "—"}`;
  if (field === "validity") return `Validated as ${newVal ?? "—"}`;
  if (field === "priority") return `Priority: ${oldVal ?? "—"} → ${newVal ?? "—"}`;
  if (field === "severity") return `Severity: ${oldVal ?? "—"} → ${newVal ?? "—"}`;
  if (field === "title") return `Renamed title`;
  if (field === "environment") return `Environment: ${oldVal ?? "—"} → ${newVal ?? "—"}`;
  return `Edited ${field.replace(/_/g, " ")}`;
}

const LINK_FIELDS: { key: keyof Defect; label: string }[] = [
  { key: "jiraUrl", label: "Jira Ticket" },
  { key: "attachmentUrl", label: "Attachment 1" },
  { key: "attachmentUrl2", label: "Attachment 2" },
  { key: "evidenceUrl", label: "Evidence" },
  { key: "screenshotUrl", label: "Screenshot" },
  { key: "videoUrl", label: "Video Recording" },
  { key: "excelUrl", label: "Excel File" },
  { key: "driveUrl", label: "Google Drive" },
];

export function DefectDetailSheet({
  defectId, open, onOpenChange, initialEdit = false,
}: {
  defectId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialEdit?: boolean;
}) {
  const { defects, audit, users, currentUser, updateDefect, addComment, updateComment, deleteComment } = useQA();
  const defect = defects.find((d) => d.id === defectId) ?? null;
  const [comment, setComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Partial<Defect>>({});

  const isAdmin = currentUser?.role === "admin";
  const isOwner = !!defect && defect.createdBy === currentUser?.name;
  const canEdit = !!defect && (isAdmin || isOwner);
  const history = useMemo(
    () => audit.filter((a) => a.defectId === defectId).slice(0, 100),
    [audit, defectId],
  );

  type TimelineItem = {
    id: string;
    at: string;
    kind: "created" | "comment" | "status" | "assigned_agent" | "priority" | "severity" | "validity" | "title" | "edit";
    actor: string;
    summary: string;
    detail?: string;
  };
  const timeline = useMemo<TimelineItem[]>(() => {
    if (!defect) return [];
    const items: TimelineItem[] = [];
    items.push({
      id: `create-${defect.id}`,
      at: defect.createdAt,
      kind: "created",
      actor: defect.createdBy,
      summary: `Reported ${defect.id}`,
      detail: defect.title,
    });
    defect.comments.forEach((c) => {
      items.push({
        id: `c-${c.id}`, at: c.createdAt, kind: "comment", actor: c.author,
        summary: "Added a comment", detail: c.text,
      });
    });
    history.forEach((h) => {
      const kind = (["status","assigned_agent","priority","severity","validity","title"] as const)
        .includes(h.field as never) ? (h.field as TimelineItem["kind"]) : "edit";
      const label = h.field.replace(/_/g, " ");
      items.push({
        id: `h-${h.id}`, at: h.changedAt, kind, actor: h.changedBy,
        summary: `Changed ${label}`,
        detail: `${h.oldValue ?? "—"} → ${h.newValue ?? "—"}`,
      });
    });
    return items.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [defect, history]);

  // Open in edit mode when requested by parent (e.g. agent clicks Edit on My Errors)
  useEffect(() => {
    if (open && initialEdit && defect && canEdit) {
      setDraft(defect);
      setEditMode(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialEdit, defectId]);

  if (!defect) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl" />
      </Sheet>
    );
  }

  const startEdit = () => { setDraft(defect); setEditMode(true); };
  const cancelEdit = () => { setEditMode(false); setDraft({}); };
  const save = async () => {
    const res = await updateDefect(defect.id, draft);
    if (res.ok) { toast.success("Defect updated"); setEditMode(false); }
    else if (!res.conflict) toast.error(res.error ?? "Update failed");
  };

  const quickPatch = async (patch: Partial<Defect>, msg: string) => {
    const res = await updateDefect(defect.id, patch);
    if (res.ok) toast.success(msg);
    else if (!res.conflict) toast.error(res.error ?? "Failed");
  };

  const v = (k: keyof Defect) => (editMode ? (draft[k] as string | undefined) ?? "" : (defect[k] as string | undefined) ?? "");
  const set = (k: keyof Defect, val: string) => setDraft((d) => ({ ...d, [k]: val }));

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) cancelEdit(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{defect.id}</span>
            <span className="truncate">{defect.title}</span>
          </SheetTitle>
          <SheetDescription className="flex flex-wrap gap-2 pt-2">
            <DefectStatusBadge status={defect.status} />
            <PriorityBadge value={defect.priority} />
            <PriorityBadge value={defect.severity} />
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
              {defect.validity === "Valid" && <ShieldCheck className="h-3 w-3 text-success" />}
              {defect.validity === "Invalid" && <ShieldX className="h-3 w-3 text-destructive" />}
              {defect.validity === "Valid"
                ? "Valid Error"
                : defect.validity === "Invalid"
                ? "Invalid Error"
                : "Pending Review"}
            </span>
          </SheetDescription>
        </SheetHeader>

        {/* Quick actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {canEdit && !editMode && (
            <Button size="sm" onClick={startEdit}>Edit</Button>
          )}
          {isAdmin && (
            <>
              <Button size="sm" variant="outline" onClick={() => quickPatch({ validity: "Valid" }, "Marked Valid Error")}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Valid Error
              </Button>
              <Button size="sm" variant="outline" onClick={() => quickPatch({ validity: "Invalid" }, "Marked Invalid Error")}>
                <XCircle className="mr-1 h-4 w-4" /> Invalid Error
              </Button>
              <Button size="sm" variant="outline" onClick={() => quickPatch({ status: "Fixed" }, "Marked Fixed")}>Fixed</Button>
              <Button size="sm" variant="outline" onClick={() => quickPatch({ status: "Retest Required" }, "Retest requested")}>Retest</Button>
              <Button size="sm" variant="outline" onClick={() => quickPatch({ status: "Reopened" }, "Reopened")}>Reopen</Button>
              <Button size="sm" variant="outline" onClick={() => quickPatch({ status: "Closed" }, "Closed")}>Close</Button>
            </>
          )}
        </div>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="links"><LinkIcon className="mr-1 h-3 w-3" />Links</TabsTrigger>
            <TabsTrigger value="comments"><MessageSquare className="mr-1 h-3 w-3" />Comments ({defect.comments.length})</TabsTrigger>
            <TabsTrigger value="history"><HistoryIcon className="mr-1 h-3 w-3" />History ({history.length})</TabsTrigger>
            <TabsTrigger value="activity"><ActivityIcon className="mr-1 h-3 w-3" />Activity ({timeline.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-4">
            {editMode ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {isAdmin && (
                <>
                <Field label="Title" className="sm:col-span-2">
                  <Input value={v("title")} onChange={(e) => set("title", e.target.value)} />
                </Field>
                <Field label="Module">
                  <Select value={v("module")} onValueChange={(x) => set("module", x)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MODULES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Form / Feature"><Input value={v("formFeature")} onChange={(e) => set("formFeature", e.target.value)} /></Field>
                </>
                )}
                <Field label="Status">
                  <Select value={v("status")} onValueChange={(x) => set("status", x)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(isAdmin ? STATUSES : (["Reported","Pending","In Progress","Retest Required","Reopened"] as DefectStatus[])).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {isAdmin && (
                <>
                <Field label="Assigned Agent">
                  <Select value={v("assignedAgent")} onValueChange={(x) => set("assignedAgent", x)} disabled={!isAdmin}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select value={v("priority")} onValueChange={(x) => set("priority", x)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LEVELS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Severity">
                  <Select value={v("severity")} onValueChange={(x) => set("severity", x)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{(LEVELS as readonly Severity[]).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                </>
                )}
                <Field label="Description" className="sm:col-span-2"><Textarea rows={3} value={v("description")} onChange={(e) => set("description", e.target.value)} /></Field>
                <Field label="Jira Ticket URL" className="sm:col-span-2">
                  <Input value={v("jiraUrl")} onChange={(e) => set("jiraUrl", e.target.value)} placeholder="https://your-org.atlassian.net/browse/…" />
                </Field>
                <Field label="Attachment Link 1"><Input value={v("attachmentUrl")} onChange={(e) => set("attachmentUrl", e.target.value)} placeholder="https://…" /></Field>
                <Field label="Attachment Link 2"><Input value={v("attachmentUrl2")} onChange={(e) => set("attachmentUrl2", e.target.value)} placeholder="https://…" /></Field>
                <Field label="Evidence Link" className="sm:col-span-2"><Input value={v("evidenceUrl")} onChange={(e) => set("evidenceUrl", e.target.value)} placeholder="https://…" /></Field>
                <Field label="Steps to Reproduce" className="sm:col-span-2"><Textarea rows={3} value={v("stepsToReproduce")} onChange={(e) => set("stepsToReproduce", e.target.value)} /></Field>
                <Field label="Expected Result"><Textarea rows={2} value={v("expectedResult")} onChange={(e) => set("expectedResult", e.target.value)} /></Field>
                <Field label="Actual Result"><Textarea rows={2} value={v("actualResult")} onChange={(e) => set("actualResult", e.target.value)} /></Field>
                <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
                  <Button onClick={save}>{isAdmin ? "Save changes" : "Resubmit for review"}</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <Field label="Module">
                  <Link
                    to={moduleRoute(defect.module)}
                    onClick={() => onOpenChange(false)}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {defect.module}
                  </Link>
                  {defect.formFeature && <span className="text-muted-foreground"> • {defect.formFeature}</span>}
                </Field>
                <Field label="Description">{defect.description || <span className="text-muted-foreground">—</span>}</Field>
                <Field label="Steps to Reproduce"><pre className="whitespace-pre-wrap font-sans">{defect.stepsToReproduce || "—"}</pre></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Expected Result">{defect.expectedResult || "—"}</Field>
                  <Field label="Actual Result">{defect.actualResult || "—"}</Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 text-xs">
                  <Field label="Assigned Agent">{defect.assignedAgent}</Field>
                  <Field label="Reported By">{defect.createdBy}</Field>
                  <Field label="Reported">{new Date(defect.createdAt).toLocaleString()}</Field>
                  <Field label="Last Updated">{new Date(defect.updatedAt).toLocaleString()} • {defect.updatedBy}</Field>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="links" className="mt-4 space-y-3">
            {LINK_FIELDS.map((f) => {
              const value = (defect[f.key] as string | undefined) ?? "";
              return (
                <div key={f.key} className="grid gap-1">
                  <Label className="text-xs">{f.label}</Label>
                  {canEdit ? (
                    <div className="flex gap-2">
                      <Input
                        defaultValue={value}
                        placeholder="https://…"
                        onBlur={async (e) => {
                          const next = e.target.value.trim();
                          if (next === value) return;
                          await quickPatch({ [f.key]: next || undefined } as Partial<Defect>, `${f.label} updated`);
                        }}
                      />
                      {value && (
                        <Button size="icon" variant="ghost" asChild>
                          <a href={value} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                        </Button>
                      )}
                    </div>
                  ) : value ? (
                    <a className="text-sm text-primary underline" href={value} target="_blank" rel="noreferrer">{value}</a>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="comments" className="mt-4">
            <ScrollArea className="h-72 rounded-md border p-3">
              <div className="space-y-2">
                {defect.comments.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
                {defect.comments.map((c) => {
                  const author = users.find((u) => u.name === c.author);
                  const role = author?.role;
                  const canEditComment = currentUser?.name === c.author || isAdmin;
                  const isEditing = editingCommentId === c.id;
                  return (
                    <div key={c.id} className="rounded-md border bg-muted/40 p-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{c.author}</span>
                          {role && (
                            <span className={role === "admin"
                              ? "rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                              : "rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"}>
                              {role}
                            </span>
                          )}
                          {c.edited && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400" title={c.updatedAt ? `Edited ${new Date(c.updatedAt).toLocaleString()}` : "Edited"}>
                              edited
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          <span>{new Date(c.createdAt).toLocaleString()}</span>
                          {canEditComment && !isEditing && (
                            <>
                              <button
                                className="rounded p-1 hover:bg-muted"
                                aria-label="Edit comment"
                                onClick={() => { setEditingCommentId(c.id); setEditingText(c.text); }}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                className="rounded p-1 text-destructive hover:bg-destructive/10"
                                aria-label="Delete comment"
                                onClick={async () => {
                                  const r = await deleteComment(c.id);
                                  if (r.ok) toast.success("Comment deleted");
                                  else toast.error(r.error ?? "Failed");
                                }}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                      {isEditing ? (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            rows={3}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setEditingCommentId(null); setEditingText(""); }}>
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={async () => {
                                if (editingText.trim() === c.text.trim()) {
                                  setEditingCommentId(null);
                                  return;
                                }
                                const r = await updateComment(c.id, editingText);
                                if (r.ok) {
                                  toast.success("Comment updated");
                                  setEditingCommentId(null);
                                  setEditingText("");
                                } else {
                                  toast.error(r.error ?? "Failed");
                                }
                              }}
                            >
                              <Check className="mr-1 h-3 w-3" /> Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-sm">{c.text}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="mt-3 flex gap-2">
              <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment, paste a link…" />
              <Button
                size="sm"
                onClick={async () => {
                  if (!comment.trim()) return;
                  const r = await addComment(defect.id, comment.trim());
                  if (r.ok) { setComment(""); toast.success("Comment added"); }
                  else toast.error(r.error ?? "Failed");
                }}
              >Post</Button>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <ScrollArea className="h-80 rounded-md border p-3">
              {(() => {
                type HItem =
                  | { kind: "created"; at: string; actor: string }
                  | { kind: "comment"; id: string; at: string; actor: string; text: string }
                  | { kind: "change"; id: string; at: string; actor: string; field: string; oldVal: string | null; newVal: string | null };
                const items: HItem[] = [
                  { kind: "created" as const, at: defect.createdAt, actor: defect.createdBy },
                  ...defect.comments.map((c) => ({ kind: "comment" as const, id: c.id, at: c.createdAt, actor: c.author, text: c.text })),
                  ...history.map((h) => ({ kind: "change" as const, id: h.id, at: h.changedAt, actor: h.changedBy, field: h.field, oldVal: h.oldValue, newVal: h.newValue })),
                ].sort((a, b) => +new Date(a.at) - +new Date(b.at));
                return (
                  <ol className="relative space-y-3">
                    {items.map((it) => {
                      if (it.kind === "created") {
                        return (
                          <li key="created" className="rounded-md border bg-card p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Reported defect</span>
                    <span className="text-muted-foreground">{new Date(defect.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                    <span>{defect.module}{defect.formFeature ? ` • ${defect.formFeature}` : ""}</span>
                    <span className="ml-auto">by {defect.createdBy}</span>
                  </div>
                </li>
                        );
                      }
                      if (it.kind === "comment") {
                        return (
                          <li key={`c-${it.id}`} className="rounded-md border bg-muted/40 p-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Added a comment</span>
                              <span className="text-muted-foreground">{new Date(it.at).toLocaleString()}</span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-foreground">{it.text}</p>
                            <p className="mt-1 text-muted-foreground">by {it.actor}</p>
                          </li>
                        );
                      }
                      const h = it;
                      return (
                        <li key={`h-${h.id}`} className="rounded-md border bg-card p-2 text-xs">
                    <div className="flex items-center justify-between">
                            <span className="font-medium">{historyLabel(h.field, h.oldVal, h.newVal)}</span>
                            <span className="text-muted-foreground">{new Date(h.at).toLocaleString()}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground line-through">{h.oldVal ?? "—"}</span>
                      <span>→</span>
                            <span className="rounded bg-success/10 px-1.5 py-0.5 text-success">{h.newVal ?? "—"}</span>
                            <span className="ml-auto text-muted-foreground">by {h.actor}</span>
                    </div>
                  </li>
                      );
                    })}
                  </ol>
                );
              })()}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <ScrollArea className="h-96 rounded-md border p-3">
              {timeline.length === 0 && <p className="text-xs text-muted-foreground">No activity yet.</p>}
              <ol className="relative space-y-3 border-l pl-4">
                {timeline.map((t) => {
                  const Icon =
                    t.kind === "created" ? Plus
                    : t.kind === "comment" ? MessageCircle
                    : t.kind === "assigned_agent" ? UserPlus
                    : t.kind === "status" ? ActivityIcon
                    : Pencil;
                  return (
                    <li key={t.id} className="relative">
                      <span className="absolute -left-[22px] top-1 inline-flex h-4 w-4 items-center justify-center rounded-full border bg-background">
                        <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                      </span>
                      <div className="rounded-md border bg-card p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{t.summary}</span>
                          <span className="text-muted-foreground">{new Date(t.at).toLocaleString()}</span>
                        </div>
                        {t.detail && (
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{t.detail}</p>
                        )}
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">by {t.actor}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}