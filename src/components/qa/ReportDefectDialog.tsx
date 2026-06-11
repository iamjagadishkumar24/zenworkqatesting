import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import {
  FORM_LIST, INTEGRATIONS, AGENTS, encodeFormFeature,
} from "@/lib/qa/constants";
import type { Defect, Module, Priority, Severity } from "@/lib/qa/types";

const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Critical"];
const SEVERITIES: Severity[] = ["Low", "Medium", "High", "Critical"];

type Draft = Omit<Defect, "id" | "createdAt" | "updatedAt" | "updatedBy" | "createdBy" | "comments"> & {
  _form: string; _integration: string;
};

function isValidUrl(u: string) {
  if (!u) return true;
  try { new URL(u); return true; } catch { return false; }
}

export function ReportDefectDialog({
  open, onOpenChange, defaultForm = "", defaultModule = "1099 Forms",
  defaultAgents,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultForm?: string;
  defaultModule?: Module;
  defaultAgents?: string[];
}) {
  const { addDefect, currentUser } = useQA();
  const { env } = useEnvironment();
  const agentOptions = defaultAgents && defaultAgents.length ? defaultAgents : AGENTS;
  const [draft, setDraft] = useState<Draft>(() => ({
    module: defaultModule, formFeature: "", title: "", description: "",
    stepsToReproduce: "", expectedResult: "", actualResult: "",
    jiraUrl: "", attachmentUrl: "", attachmentUrl2: "", evidenceUrl: "",
    status: "Reported", priority: "Medium", severity: "Medium",
    environment: env ?? "Production",
    assignedAgent: agentOptions[0] ?? "", _form: defaultForm, _integration: "",
  }));

  useEffect(() => {
    if (open) {
      setDraft((d) => ({ ...d, _form: defaultForm || d._form, module: defaultModule, environment: env ?? d.environment ?? "Production" }));
    }
  }, [open, defaultForm, defaultModule, env]);

  const upd = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async () => {
    if (!draft._form) return toast.error("Please select a form");
    // Integration is only required for 1099 form testing
    if (draft.module === "1099 Forms" && !draft._integration) return toast.error("Please select an integration");
    if (!draft.assignedAgent) return toast.error("Please select an assigned agent");
    if (!draft.title.trim()) return toast.error("Title is required");
    if (!draft.description.trim()) return toast.error("Description is required");
    if (draft.jiraUrl && !isValidUrl(draft.jiraUrl)) return toast.error("Jira URL is not valid");
    if (draft.attachmentUrl && !isValidUrl(draft.attachmentUrl)) return toast.error("Attachment URL is not valid");

    const payload = {
      ...draft,
      formFeature: encodeFormFeature(draft._form, draft._integration),
    };
    delete (payload as Partial<Draft>)._form;
    delete (payload as Partial<Draft>)._integration;

    const r = await addDefect(payload);
    if (!r.ok) return toast.error(r.error ?? "Could not save");
    toast.success("Defect reported");
    onOpenChange(false);
    setDraft({
      module: defaultModule, formFeature: "", title: "", description: "",
      stepsToReproduce: "", expectedResult: "", actualResult: "",
      jiraUrl: "", attachmentUrl: "", attachmentUrl2: "", evidenceUrl: "",
      status: "Reported", priority: "Medium", severity: "Medium",
      assignedAgent: currentUser?.role === "agent" ? currentUser.name : AGENTS[0],
      _form: "", _integration: "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report a defect</DialogTitle>
          <DialogDescription>Capture the reproduction details so engineering can act fast.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Form *</Label>
            <Select value={draft._form} onValueChange={(v) => upd("_form", v)}>
              <SelectTrigger><SelectValue placeholder="Select a form" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {FORM_LIST.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Integration{draft.module === "1099 Forms" ? " *" : ""}</Label>
            <Select value={draft._integration} onValueChange={(v) => upd("_integration", v)}>
              <SelectTrigger><SelectValue placeholder="Select integration" /></SelectTrigger>
              <SelectContent>
                {INTEGRATIONS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Environment</Label>
            <Select value={draft.environment ?? "Production"} onValueChange={(v) => upd("environment", v as Draft["environment"]) }>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Production">Production</SelectItem>
                <SelectItem value="Stage">Stage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Assigned Agent *</Label>
            <Select value={draft.assignedAgent} onValueChange={(v) => upd("assignedAgent", v)}>
              <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {agentOptions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={draft.priority} onValueChange={(v) => upd("priority", v as Priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Severity</Label>
            <Select value={draft.severity} onValueChange={(v) => upd("severity", v as Severity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SEVERITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Error Title *</Label>
            <Input value={draft.title} onChange={(e) => upd("title", e.target.value)} placeholder="Short summary of the issue" />
          </div>
          <div className="sm:col-span-2">
            <Label>Description / Comments *</Label>
            <Textarea rows={3} value={draft.description} onChange={(e) => upd("description", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Steps to Reproduce</Label>
            <Textarea rows={3} value={draft.stepsToReproduce} onChange={(e) => upd("stepsToReproduce", e.target.value)} />
          </div>
          <div>
            <Label>Expected Result</Label>
            <Textarea rows={2} value={draft.expectedResult} onChange={(e) => upd("expectedResult", e.target.value)} />
          </div>
          <div>
            <Label>Actual Result</Label>
            <Textarea rows={2} value={draft.actualResult} onChange={(e) => upd("actualResult", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Jira Ticket URL</Label>
            <Input value={draft.jiraUrl ?? ""} onChange={(e) => upd("jiraUrl", e.target.value)} placeholder="https://your-org.atlassian.net/browse/…" />
          </div>
          <div>
            <Label>Attachment Link 1</Label>
            <Input value={draft.attachmentUrl ?? ""} onChange={(e) => upd("attachmentUrl", e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <Label>Attachment Link 2</Label>
            <Input value={draft.attachmentUrl2 ?? ""} onChange={(e) => upd("attachmentUrl2", e.target.value)} placeholder="https://…" />
          </div>
          <div className="sm:col-span-2">
            <Label>Evidence / Screenshot URL</Label>
            <Input value={draft.evidenceUrl ?? ""} onChange={(e) => upd("evidenceUrl", e.target.value)} placeholder="https://…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>Create defect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}