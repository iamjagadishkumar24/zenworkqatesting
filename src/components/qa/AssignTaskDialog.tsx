import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import {
  listAssignableFormsForModule,
  previewAssignableFormsForModule,
  type AssignablePreviewItem,
  type AssignablePreviewResult,
  type PreviewSortDir,
  type PreviewSortKey,
} from "@/lib/qa/assignment.functions";

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
  const { users, forms, addDefect, defects } = useQA();
  const { env } = useEnvironment();
  const { createAssignment } = useRetests();
  const { items: invites } = useAgentInvites();
  const notifyByEmail = useServerFn(sendTaskAssignmentEmail);
  const listForms = useServerFn(listAssignableFormsForModule);
  const previewForms = useServerFn(previewAssignableFormsForModule);
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
  const [showPreview, setShowPreview] = useState(false);
  const [creatingDefect, setCreatingDefect] = useState(false);
  // Scope preview panel state — persisted per module across reopens via
  // sessionStorage. Pagination + search + sort all run on the server so the
  // dialog never ships the full catalog over the wire.
  const PREVIEW_PAGE_SIZE = 24;
  type PreviewState = { query: string; page: number; sortBy: PreviewSortKey; sortDir: PreviewSortDir };
  const previewStateKey = (m: string) => `assignTaskScopePreview:${m}`;
  const readPreviewState = (m: string): PreviewState => {
    if (typeof window === "undefined") return { query: "", page: 1, sortBy: "name", sortDir: "asc" };
    try {
      const raw = window.sessionStorage.getItem(previewStateKey(m));
      if (raw) {
        const p = JSON.parse(raw) as Partial<PreviewState>;
        return {
          query: typeof p.query === "string" ? p.query : "",
          page: typeof p.page === "number" && p.page > 0 ? p.page : 1,
          sortBy: p.sortBy === "version" || p.sortBy === "createdAt" ? p.sortBy : "name",
          sortDir: p.sortDir === "desc" ? "desc" : "asc",
        };
      }
    } catch { /* ignore */ }
    return { query: "", page: 1, sortBy: "name", sortDir: "asc" };
  };
  const [previewQuery, setPreviewQuery] = useState("");
  const [previewPage, setPreviewPage] = useState(1);
  const [previewSortBy, setPreviewSortBy] = useState<PreviewSortKey>("name");
  const [previewSortDir, setPreviewSortDir] = useState<PreviewSortDir>("asc");
  const [previewItems, setPreviewItems] = useState<AssignablePreviewItem[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Restore persisted preview state whenever the module changes (also on open).
  useEffect(() => {
    if (!open) return;
    const s = readPreviewState(moduleSel);
    setPreviewQuery(s.query);
    setPreviewPage(s.page);
    setPreviewSortBy(s.sortBy);
    setPreviewSortDir(s.sortDir);
  }, [open, moduleSel]);
  // Persist on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        previewStateKey(moduleSel),
        JSON.stringify({ query: previewQuery, page: previewPage, sortBy: previewSortBy, sortDir: previewSortDir }),
      );
    } catch { /* ignore */ }
  }, [moduleSel, previewQuery, previewPage, previewSortBy, previewSortDir]);
  // Reset to page 1 when query/sort change.
  useEffect(() => { setPreviewPage(1); }, [previewQuery, previewSortBy, previewSortDir]);
  // Server-side fetch (debounced for search).
  useEffect(() => {
    if (!open || !showPreview) return;
    if (!moduleSel || moduleSel === ALL_MODULES) {
      setPreviewItems([]); setPreviewTotal(0); return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const t = window.setTimeout(() => {
      previewForms({
        data: {
          module: moduleSel,
          query: previewQuery,
          page: previewPage,
          pageSize: PREVIEW_PAGE_SIZE,
          sortBy: previewSortBy,
          sortDir: previewSortDir,
        },
      })
        .then((res: AssignablePreviewResult) => {
          if (cancelled) return;
          setPreviewItems(res.items ?? []);
          setPreviewTotal(res.total ?? 0);
        })
        .catch(() => {
          if (cancelled) return;
          setPreviewItems([]); setPreviewTotal(0);
        })
        .finally(() => { if (!cancelled) setPreviewLoading(false); });
    }, 200);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [open, showPreview, moduleSel, previewQuery, previewPage, previewSortBy, previewSortDir, previewForms]);
  const previewTotalPages = Math.max(1, Math.ceil(previewTotal / PREVIEW_PAGE_SIZE));
  const previewSafePage = Math.min(previewPage, previewTotalPages);
  const toggleSort = (key: PreviewSortKey) => {
    if (previewSortBy === key) {
      setPreviewSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setPreviewSortBy(key);
      setPreviewSortDir("asc");
    }
  };
  const sortIndicator = (key: PreviewSortKey) =>
    previewSortBy === key ? (previewSortDir === "asc" ? " ▲" : " ▼") : "";
  // Track the most recent defect created from this banner so realtime
  // updates to its status are reflected immediately in the dialog.
  const [createdDefectTitle, setCreatedDefectTitle] = useState<string | null>(null);
  const [createdDefectAfter, setCreatedDefectAfter] = useState<number>(0);
  useEffect(() => {
    setScopeError(null);
    setCreatedDefectTitle(null);
  }, [moduleSel, picked, allForms]);
  const createdDefect = useMemo(() => {
    if (!createdDefectTitle) return null;
    const matches = defects
      .filter((d) => d.title === createdDefectTitle && new Date(d.createdAt).getTime() >= createdDefectAfter - 1000)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return matches[0] ?? null;
  }, [defects, createdDefectTitle, createdDefectAfter]);

  // Offender detail drawer. Opens from the validation banner chips and from
  // the live defect badge's "Affected" link. Pulls related-defect history
  // straight from the realtime-backed store so updates stay live.
  const [offenderName, setOffenderName] = useState<string | null>(null);
  const offenderInfo = useMemo(() => {
    if (!offenderName) return null;
    const catalogHit = scopedForms.find((f) => f.name === offenderName) ?? null;
    const related = defects
      .filter((d) => d.formFeature === offenderName)
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime());
    return { name: offenderName, inCatalog: !!catalogHit, related };
  }, [offenderName, scopedForms, defects]);

  const createDefectFromScopeError = async () => {
    if (!scopeError) return;
    setCreatingDefect(true);
    const offendersList = scopeError.offenders.length
      ? scopeError.offenders.join(", ")
      : "(none reported)";
    const allowedList = scopedForms.map((f) => f.name).join(", ") || "(empty catalog)";
    const defectTitle = `Assign Task scope validation failed: ${moduleSel} @ ${new Date().toISOString()}`;
    const submittedAt = Date.now();
    const res = await addDefect({
      module: (moduleSel && moduleSel !== ALL_MODULES ? moduleSel : "Functionality Testing") as never,
      formFeature: scopeError.offenders[0] ?? "Assign Task scope validation",
      taxYear,
      title: defectTitle,
      description:
        `Scope validation rejected the Assign Task submission.\n\n` +
        `Module / Category: ${moduleSel}\n` +
        `Error: ${scopeError.message}\n` +
        `Offending forms/features: ${offendersList}\n` +
        `Allowed for this module: ${allowedList}`,
      stepsToReproduce:
        `1. Open Assign Task.\n` +
        `2. Select Module/Category "${moduleSel}".\n` +
        `3. Pick forms/features: ${offendersList}.\n` +
        `4. Click Assign Task.`,
      expectedResult: "Selection is accepted, or the picker prevents invalid choices.",
      actualResult: `Validation error: ${scopeError.message}`,
      status: "Open" as never,
      priority: priority as never,
      severity: "Medium" as never,
      validity: "Unverified",
      environment: (env ?? "Production") as never,
      assignedAgent: "",
    });
    setCreatingDefect(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not create defect");
      return;
    }
    setCreatedDefectTitle(defectTitle);
    setCreatedDefectAfter(submittedAt);
    toast.success("Defect created from scope validation failure.");
  };

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
      const msg = r.error ?? "Could not assign task";
      setScopeError({ message: msg, offenders });
      return toast.error(msg);
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
            {scopeError && (
              <div
                role="alert"
                aria-live="polite"
                className="mt-1 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive"
              >
                <div className="font-medium">{scopeError.message}</div>
                {scopeError.offenders.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {scopeError.offenders.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setOffenderName(n)}
                        className="rounded bg-destructive/15 px-1.5 py-0.5 hover:bg-destructive/25 underline-offset-2 hover:underline"
                        title="View offender details"
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={createDefectFromScopeError}
                    disabled={creatingDefect || !!createdDefect}
                  >
                    {creatingDefect
                      ? "Creating defect…"
                      : createdDefect
                        ? `Defect ${createdDefect.id} · ${createdDefect.status}`
                        : "Create defect from this failure"}
                  </Button>
                  {createdDefect && (
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      Affected:{" "}
                      <button
                        type="button"
                        onClick={() => setOffenderName(createdDefect.formFeature)}
                        className="font-medium text-foreground hover:underline"
                      >
                        {createdDefect.formFeature}
                      </button>
                      {" · "}Live status: <span className="font-medium text-foreground">{createdDefect.status}</span>
                      {" · "}Priority {createdDefect.priority} · Severity {createdDefect.severity}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="font-medium text-foreground">
                  Scope preview — allowed for {moduleSel === ALL_MODULES ? "All Modules" : moduleSel}
                  <span className="ml-1 text-muted-foreground">
                    ({moduleSel === ALL_MODULES ? scopedForms.length : previewTotal})
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview((v) => !v)}
                  disabled={moduleSel === ALL_MODULES ? scopedForms.length === 0 : false}
                >
                  {showPreview ? "Hide" : "Show"}
                </Button>
              </div>
              {showPreview && (
                <div className="mt-2 space-y-2">
                  <div className="relative">
                    <Input
                      value={previewQuery}
                      onChange={(e) => setPreviewQuery(e.target.value)}
                      placeholder="Search allowed forms / features…"
                      className="h-7 text-xs pr-20"
                    />
                    {previewLoading && moduleSel !== ALL_MODULES && (
                      <span
                        aria-live="polite"
                        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                      >
                        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-muted-foreground/60" />
                        Searching…
                      </span>
                    )}
                  </div>
                  <div className="max-h-48 overflow-auto rounded border bg-background">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1">
                            <button type="button" className="hover:underline" onClick={() => toggleSort("name")}>
                              Name{sortIndicator("name")}
                            </button>
                          </th>
                          <th className="px-2 py-1 w-24">
                            <button type="button" className="hover:underline" onClick={() => toggleSort("version")}>
                              Version{sortIndicator("version")}
                            </button>
                          </th>
                          <th className="px-2 py-1 w-36">
                            <button type="button" className="hover:underline" onClick={() => toggleSort("createdAt")}>
                              Created{sortIndicator("createdAt")}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {moduleSel === ALL_MODULES ? (
                          <tr><td colSpan={3} className="px-2 py-2 text-muted-foreground">Select a Module / Category to preview its catalog.</td></tr>
                        ) : previewLoading && previewItems.length === 0 ? (
                          <tr><td colSpan={3} className="px-2 py-2 text-muted-foreground">Loading allowed forms / features…</td></tr>
                        ) : previewItems.length === 0 ? (
                          <tr><td colSpan={3} className="px-2 py-3 text-center text-muted-foreground">
                            {previewQuery ? (
                              <>
                                No allowed forms / features match{" "}
                                <span className="font-medium text-foreground">“{previewQuery}”</span> in{" "}
                                <span className="font-medium text-foreground">{moduleSel}</span>.
                                <div className="mt-1">
                                  <Button type="button" variant="ghost" size="sm" className="h-6 px-2"
                                    onClick={() => setPreviewQuery("")}>
                                    Clear search
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>No forms / features are mapped to <span className="font-medium text-foreground">{moduleSel}</span> yet.</>
                            )}
                          </td></tr>
                        ) : (
                          previewItems.map((f) => (
                            <tr key={f.id} className="border-t">
                              <td className="px-2 py-1">
                                <button
                                  type="button"
                                  className="hover:underline"
                                  onClick={() => setOffenderName(f.name)}
                                >
                                  {f.name}
                                </button>
                              </td>
                              <td className="px-2 py-1 tabular-nums">{f.version ?? "—"}</td>
                              <td className="px-2 py-1 tabular-nums">
                                {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : "—"}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {moduleSel !== ALL_MODULES && previewTotal > PREVIEW_PAGE_SIZE && (
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        Showing {(previewSafePage - 1) * PREVIEW_PAGE_SIZE + 1}
                        –{Math.min(previewSafePage * PREVIEW_PAGE_SIZE, previewTotal)} of {previewTotal}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                          disabled={previewSafePage <= 1}
                        >
                          Prev
                        </Button>
                        <span>
                          Page {previewSafePage} / {previewTotalPages}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2"
                          onClick={() => setPreviewPage((p) => Math.min(previewTotalPages, p + 1))}
                          disabled={previewSafePage >= previewTotalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
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

    <Sheet open={!!offenderName} onOpenChange={(o) => { if (!o) setOffenderName(null); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="break-all">{offenderName ?? ""}</SheetTitle>
          <SheetDescription>
            Affected form / feature from the Assign Task scope check in{" "}
            <span className="font-medium text-foreground">{moduleSel}</span>.
          </SheetDescription>
        </SheetHeader>
        {offenderInfo && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <div className="text-muted-foreground">Module</div>
              <div className="col-span-2 font-medium">{moduleSel}</div>
              <div className="text-muted-foreground">In catalog</div>
              <div className="col-span-2">
                {offenderInfo.inCatalog ? (
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400">Allowed</span>
                ) : (
                  <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">Not in this module's catalog</span>
                )}
              </div>
              <div className="text-muted-foreground">Environment</div>
              <div className="col-span-2">{env ?? "Production"}</div>
              <div className="text-muted-foreground">Tax year</div>
              <div className="col-span-2">{taxYear}</div>
            </div>
            {scopeError && scopeError.offenders.includes(offenderInfo.name) && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                <div className="font-medium">Validation failure</div>
                <div className="mt-1">{scopeError.message}</div>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Related defects ({offenderInfo.related.length})
              </div>
              {offenderInfo.related.length === 0 ? (
                <div className="text-xs text-muted-foreground">No defects reference this form / feature yet.</div>
              ) : (
                <ul className="space-y-1">
                  {offenderInfo.related.slice(0, 20).map((d) => (
                    <li key={d.id} className="rounded border p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono">{d.id}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5">{d.status}</span>
                      </div>
                      <div className="mt-1 line-clamp-2">{d.title}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Priority {d.priority} · Severity {d.severity} · Updated {new Date(d.updatedAt ?? d.createdAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
    </>
  );
}