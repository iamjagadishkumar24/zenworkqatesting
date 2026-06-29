import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import {
  FORM_LIST,
  INTEGRATIONS,
  AGENTS,
  encodeFormFeature,
  TAX_YEARS,
  DEFAULT_TAX_YEAR,
  US_STATES,
  isValidUsState,
} from "@/lib/qa/constants";
import type { Defect, Module, Priority, QbDesktopCategory } from "@/lib/qa/types";
import { QB_DESKTOP_CATEGORIES } from "@/lib/qa/types";

const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Critical"];

/**
 * Dedicated error reporting categories for 2290.ai. These mirror the three
 * filing options shown on the 2290.ai landing page and are required when the
 * selected form is "2290.ai". The chosen category is persisted into the
 * existing `schedules` field so it flows through filters, search, reports,
 * dashboards and CSV exports without a schema change.
 */
export const FORM_2290_AI_CATEGORIES: readonly string[] = [
  "Take a Picture & Upload",
  "eFiling Wizard",
  "One-Click eFiling",
] as const;

type Draft = Omit<
  Defect,
  "id" | "createdAt" | "updatedAt" | "updatedBy" | "createdBy" | "comments"
> & {
  _form: string;
  _integration: string;
};

function isValidUrl(u: string) {
  if (!u) return true;
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

export function ReportDefectDialog({
  open,
  onOpenChange,
  defaultForm = "",
  defaultModule = "1099 Forms",
  defaultAgents,
  defaultIntegration = "",
  featureMode = false,
  formOptions,
  defaultTaxYear,
  lockTaxYear = false,
  defaultQbCategory,
  lockQbCategory = false,
  scheduleOptions,
  scheduleLabel = "Schedules / Related Forms",
  requireState = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultForm?: string;
  defaultModule?: Module;
  defaultAgents?: string[];
  defaultIntegration?: string;
  /** When true, hide form/integration dropdowns and treat defaultForm as the read-only feature/module item. */
  featureMode?: boolean;
  /** Optional restricted list of forms (e.g. Integrations → only 1099-NEC / 1099-MISC). */
  formOptions?: string[];
  /** Inherit tax year (e.g. from an assigned task). */
  defaultTaxYear?: string;
  /** Lock tax year selection when reporting from an assigned task. */
  lockTaxYear?: boolean;
  /** Pre-select a QuickBooks Desktop category (required for QB Desktop). */
  defaultQbCategory?: QbDesktopCategory;
  /** Lock the QB Desktop category to the pre-selected value. */
  lockQbCategory?: boolean;
  /** When provided, show a multi-select of schedules / related forms tied to the parent form. */
  scheduleOptions?: string[];
  /** Optional label override for the schedules section. */
  scheduleLabel?: string;
  /**
   * When true, require an explicit U.S. state on this report. Used only by the
   * State Filing feature card so the dropdown stays hidden everywhere else.
   */
  requireState?: boolean;
}) {
  const { addDefect, currentUser } = useQA();
  const { env } = useEnvironment();
  const isAgent = currentUser?.role === "agent";
  const isAdmin = currentUser?.role === "admin";
  // Admin can always edit, even when a default tax year is inherited from a task.
  const taxYearLocked = lockTaxYear && !isAdmin;
  // Agents can only assign errors to themselves. Admins see the full list (or
  // a restricted list if the caller provided one).
  const agentOptions =
    isAgent && currentUser
      ? [currentUser.name]
      : defaultAgents && defaultAgents.length
        ? defaultAgents
        : AGENTS;
  const showIntegration = !featureMode && defaultModule === "Integrations";
  const lockIntegration = showIntegration && !!defaultIntegration;
  const showForm = !featureMode;
  const formChoices = formOptions && formOptions.length ? formOptions : FORM_LIST;
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>([]);
  const [aiCategory, setAiCategory] = useState<string>("");
  const [stateCode, setStateCode] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const toggleSchedule = (s: string) =>
    setSelectedSchedules((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  const [draft, setDraft] = useState<Draft>(() => ({
    module: defaultModule,
    formFeature: "",
    title: "",
    description: "",
    stepsToReproduce: "",
    expectedResult: "",
    actualResult: "",
    jiraUrl: "",
    attachmentUrl: "",
    attachmentUrl2: "",
    evidenceUrl: "",
    status: "Reported",
    priority: "Medium",
    severity: "Medium",
    environment: env ?? "Production",
    taxYear: defaultTaxYear ?? DEFAULT_TAX_YEAR,
    qbDesktopCategory: defaultQbCategory,
    assignedAgent: (isAgent && currentUser?.name) || agentOptions[0] || "",
    _form: defaultForm,
    _integration: defaultIntegration,
  }));

  useEffect(() => {
    if (open) {
      setSelectedSchedules([]);
      setAiCategory("");
      setStateCode("");
      setDraft((d) => ({
        ...d,
        _form: defaultForm || d._form,
        _integration: defaultIntegration || d._integration,
        module: defaultModule,
        environment: env ?? d.environment ?? "Production",
        taxYear: defaultTaxYear ?? d.taxYear ?? DEFAULT_TAX_YEAR,
        qbDesktopCategory: defaultQbCategory ?? d.qbDesktopCategory,
        assignedAgent:
          isAgent && currentUser?.name
            ? currentUser.name
            : d.assignedAgent || agentOptions[0] || "",
      }));
    }
  }, [
    open,
    defaultForm,
    defaultModule,
    defaultIntegration,
    defaultTaxYear,
    defaultQbCategory,
    env,
    isAgent,
    currentUser?.name,
  ]);

  const upd = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const is2290Ai = !featureMode && draft._form === "2290.ai";

  const submit = async () => {
    if (submitting) return;
    if (showForm && !draft._form) return toast.error("Please select a form");
    if (featureMode && !draft._form) return toast.error("Missing feature context");
    // Integration only applies when reporting from the Integrations module
    if (showIntegration && !draft._integration) return toast.error("Please select an integration");
    if (
      showIntegration &&
      draft._integration === "QuickBooks Desktop" &&
      !draft.qbDesktopCategory
    ) {
      return toast.error("Please select a QuickBooks Desktop category");
    }
    if (!draft.assignedAgent) return toast.error("Please select an assigned agent");
    if (!draft.title.trim()) return toast.error("Title is required");
    if (!draft.description.trim()) return toast.error("Description is required");
    if (draft.jiraUrl && !isValidUrl(draft.jiraUrl)) return toast.error("Jira URL is not valid");
    if (draft.attachmentUrl && !isValidUrl(draft.attachmentUrl))
      return toast.error("Attachment URL is not valid");
    if (!draft.taxYear) return toast.error("Please select the tax year for this reported error.");
    if (scheduleOptions && scheduleOptions.length > 0 && selectedSchedules.length === 0) {
      return toast.error(`Please select at least one ${scheduleLabel.toLowerCase()} entry.`);
    }
    if (is2290Ai && !aiCategory) {
      return toast.error("Please select a 2290.ai issue category.");
    }
    if (requireState && !isValidUsState(stateCode)) {
      return toast.error("Please select the U.S. state for this State Filing error.");
    }

    const schedulesPayload = is2290Ai
      ? [aiCategory]
      : selectedSchedules.length > 0
        ? [...selectedSchedules]
        : undefined;
    const payload = {
      ...draft,
      formFeature: featureMode ? draft._form : encodeFormFeature(draft._form, draft._integration),
      schedules: schedulesPayload,
      state: requireState ? stateCode : undefined,
    };
    delete (payload as Partial<Draft>)._form;
    delete (payload as Partial<Draft>)._integration;

    setSubmitting(true);
    const pending = toast.loading("Reporting error…");
    try {
      const r = await addDefect(payload);
      if (!r.ok) {
        toast.error(r.error ?? "Could not save", { id: pending });
        return;
      }
      toast.success("Error reported", { id: pending });
      onOpenChange(false);
      setDraft({
      module: defaultModule,
      formFeature: "",
      title: "",
      description: "",
      stepsToReproduce: "",
      expectedResult: "",
      actualResult: "",
      jiraUrl: "",
      attachmentUrl: "",
      attachmentUrl2: "",
      evidenceUrl: "",
      status: "Reported",
      priority: "Medium",
      severity: "Medium",
      assignedAgent: currentUser?.role === "agent" ? currentUser.name : AGENTS[0],
      _form: "",
      _integration: "",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      toast.error(msg, { id: pending });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report an error</DialogTitle>
          <DialogDescription>Capture the issue so engineering can act fast.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {featureMode ? (
            <>
              <div>
                <Label>Module</Label>
                <Input value={defaultModule} readOnly disabled aria-readonly />
              </div>
              <div>
                <Label>Feature</Label>
                <Input value={draft._form} readOnly disabled aria-readonly />
              </div>
            </>
          ) : (
            <div>
              <Label>Form *</Label>
              {defaultForm ? (
                <Input value={draft._form} readOnly disabled aria-readonly />
              ) : (
                <Select value={draft._form} onValueChange={(v) => upd("_form", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a form" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {formChoices.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          {is2290Ai && (
            <div className="sm:col-span-2" data-testid="form-2290-ai-category">
              <Label htmlFor="form-2290-ai-category-select">2290.ai Issue Category *</Label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Match the filing option on the 2290.ai home page where the issue occurred.
              </p>
              <Select value={aiCategory} onValueChange={(v) => setAiCategory(v)}>
                <SelectTrigger
                  id="form-2290-ai-category-select"
                  aria-required="true"
                  aria-invalid={is2290Ai && !aiCategory ? true : undefined}
                  className="mt-2"
                >
                  <SelectValue placeholder="Select a 2290.ai issue category" />
                </SelectTrigger>
                <SelectContent>
                  {FORM_2290_AI_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {showIntegration && (
            <div>
              <Label>Integration *</Label>
              {lockIntegration ? (
                <Input value={draft._integration} readOnly disabled aria-readonly />
              ) : (
                <Select value={draft._integration} onValueChange={(v) => upd("_integration", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select integration" />
                  </SelectTrigger>
                  <SelectContent>
                    {INTEGRATIONS.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          {showIntegration && draft._integration === "QuickBooks Desktop" && (
            <div>
              <Label>QuickBooks Desktop Category *</Label>
              {lockQbCategory && draft.qbDesktopCategory ? (
                <Input value={draft.qbDesktopCategory} readOnly disabled aria-readonly />
              ) : (
                <Select
                  value={draft.qbDesktopCategory ?? ""}
                  onValueChange={(v) => upd("qbDesktopCategory", v as QbDesktopCategory)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {QB_DESKTOP_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <div>
            <Label>Environment</Label>
            <Input
              value={draft.environment ?? env ?? "Production"}
              readOnly
              disabled
              aria-readonly
            />
          </div>
          <div>
            <Label>Tax Year *</Label>
            {taxYearLocked ? (
              <Input value={draft.taxYear ?? ""} readOnly disabled aria-readonly />
            ) : (
              <Select value={draft.taxYear ?? ""} onValueChange={(v) => upd("taxYear", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Tax Year" />
                </SelectTrigger>
                <SelectContent>
                  {TAX_YEARS.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {lockTaxYear && isAdmin && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Inherited from task — admin override enabled.
              </p>
            )}
          </div>
          <div>
            <Label>Assigned Agent *</Label>
            {isAgent ? (
              <Input value={draft.assignedAgent} readOnly disabled aria-readonly />
            ) : (
              <Select value={draft.assignedAgent} onValueChange={(v) => upd("assignedAgent", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {agentOptions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={draft.priority} onValueChange={(v) => upd("priority", v as Priority)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Error Title *</Label>
            <Input
              value={draft.title}
              onChange={(e) => upd("title", e.target.value)}
              placeholder="Short summary of the issue"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Description / Comments *</Label>
            <Textarea
              rows={3}
              value={draft.description}
              onChange={(e) => upd("description", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Expected Result / Outcome</Label>
            <Textarea
              rows={2}
              value={draft.expectedResult}
              onChange={(e) => upd("expectedResult", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Jira Ticket URL</Label>
            <Input
              value={draft.jiraUrl ?? ""}
              onChange={(e) => upd("jiraUrl", e.target.value)}
              placeholder="https://your-org.atlassian.net/browse/…"
            />
          </div>
          <div>
            <Label>Attachment Link 1</Label>
            <Input
              value={draft.attachmentUrl ?? ""}
              onChange={(e) => upd("attachmentUrl", e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div>
            <Label>Attachment Link 2</Label>
            <Input
              value={draft.attachmentUrl2 ?? ""}
              onChange={(e) => upd("attachmentUrl2", e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Screenshots / Recordings Link</Label>
            <Input
              value={draft.evidenceUrl ?? ""}
              onChange={(e) => upd("evidenceUrl", e.target.value)}
              placeholder="https://…"
            />
          </div>
          {requireState && (
            <div className="sm:col-span-2" data-testid="state-filing-state">
              <Label htmlFor="state-filing-state-select">U.S. State *</Label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Select the state this State Filing issue applies to. One state per report.
              </p>
              <Select value={stateCode} onValueChange={(v) => setStateCode(v)}>
                <SelectTrigger
                  id="state-filing-state-select"
                  aria-required="true"
                  aria-invalid={requireState && !isValidUsState(stateCode) ? true : undefined}
                  className="mt-2"
                >
                  <SelectValue placeholder="Select a U.S. state or territory" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {US_STATES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {scheduleOptions && scheduleOptions.length > 0 && (
            <div className="sm:col-span-2" data-testid="schedules-section">
              <Label>{scheduleLabel}</Label>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Select one or more schedules / related forms to associate with this{" "}
                {draft._form || "form"} report.
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 rounded-md border border-border p-3 sm:grid-cols-2">
                {scheduleOptions.map((s) => {
                  const id = `sched-${s.replace(/\s+/g, "-")}`;
                  const checked = selectedSchedules.includes(s);
                  return (
                    <label
                      key={s}
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={() => toggleSchedule(s)}
                      />
                      <span>{s}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting} aria-busy={submitting}>
            {submitting ? "Creating…" : "Create Error"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
