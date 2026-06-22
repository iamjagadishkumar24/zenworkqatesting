import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Bug, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { encodeFormFeature, DEFAULT_TAX_YEAR } from "@/lib/qa/constants";

export const GENERAL_990_FORM = "General 990 Series Issues";

const ISSUE_CATEGORIES = [
  "EIN-related",
  "Dashboard",
  "Navigation",
  "UI/UX",
  "Form Loading",
  "Validation",
  "Search & Filter",
  "Workflow",
  "Reporting",
  "Data Display",
  "Attachment",
  "Performance",
  "Notifications",
  "General Application",
  "Other",
] as const;

const AREAS = [
  "Dashboard",
  "EIN Lookup",
  "Form 990 Module",
  "Form 990-N Module",
  "Form 990-T Module",
  "Form 990-PF Module",
  "Form 990-EZ Module",
  "Navigation",
  "Search",
  "Reports",
  "Attachments",
  "Notifications",
  "Other",
] as const;

export function General990IssuesPanel() {
  const { addDefect, currentUser } = useQA();
  const { env } = useEnvironment();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ein, setEin] = useState("");
  const [category, setCategory] = useState<string>("");
  const [area, setArea] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setEin("");
    setCategory("");
    setArea("");
    setSummary("");
    setDescription("");
  };

  const submit = async () => {
    if (!category) return toast.error("Please select an issue category.");
    if (!area) return toast.error("Please select an area / module.");
    if (summary.trim().length < 4) return toast.error("Please provide a short issue summary.");
    if (description.trim().length < 10)
      return toast.error("Please provide a more detailed issue description.");
    if (ein && !/^\d{2}-?\d{7}$/.test(ein.trim()))
      return toast.error("EIN must be 9 digits (e.g. 12-3456789).");

    setSubmitting(true);
    const res = await addDefect({
      module: "990 Forms",
      formFeature: encodeFormFeature(GENERAL_990_FORM),
      taxYear: DEFAULT_TAX_YEAR,
      title: summary.trim(),
      description: [
        ein ? `EIN: ${ein.trim()}` : null,
        `Category: ${category}`,
        `Area: ${area}`,
        "",
        description.trim(),
      ]
        .filter((v) => v !== null)
        .join("\n"),
      stepsToReproduce: "",
      expectedResult: "",
      actualResult: "",
      status: "Reported",
      priority: "Medium",
      severity: "Medium",
      environment: env ?? undefined,
      assignedAgent: currentUser?.name ?? "",
    });
    setSubmitting(false);
    if (!res.ok) return toast.error(res.error ?? "Could not submit issue.");
    toast.success("General 990 series issue reported.");
    reset();
    setOpen(false);
  };

  return (
    <>
      <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-500/5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-amber-500/15 p-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold leading-tight">General 990 Series Issues</h3>
                <Badge variant="outline" className="text-[10px]">Cross-form</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Report defects that affect the overall 990 filing experience (EIN lookup, dashboard,
                navigation, search, validation, performance, attachments, etc.) — not specific to a
                single 990 form.
              </p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)} className="shrink-0">
            <Bug className="mr-2 h-4 w-4" /> Report Error
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : (setOpen(false), reset()))}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Report General 990 Series Issue</DialogTitle>
            <DialogDescription>
              Use this form for issues impacting the overall 990 module rather than a specific form.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="g990-ein">EIN (optional)</Label>
              <Input
                id="g990-ein"
                value={ein}
                onChange={(e) => setEin(e.target.value)}
                placeholder="12-3456789"
                inputMode="numeric"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Issue Category *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {ISSUE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Area / Dashboard / Module *</Label>
                <Select value={area} onValueChange={setArea}>
                  <SelectTrigger><SelectValue placeholder="Select area" /></SelectTrigger>
                  <SelectContent>
                    {AREAS.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="g990-summary">Issue Summary *</Label>
              <Input
                id="g990-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Short headline (e.g. Dashboard not loading)"
                maxLength={140}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="g990-desc">Issue Description *</Label>
              <Textarea
                id="g990-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue, where it occurs, and any relevant context."
                rows={5}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Submitting…" : "Report Error"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}