import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQA } from "@/lib/qa/store";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { extractDefectId, stripDefectTag } from "@/lib/qa/retestLink";
import type { RetestAssignment } from "@/lib/qa/retest";

type Result = "Passed" | "Failed";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assignment: RetestAssignment | null;
}

export function SubmitRetestDialog({ open, onOpenChange, assignment }: Props) {
  const { currentUser, addComment, updateDefect } = useQA();
  const [result, setResult] = useState<Result>("Passed");
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) { setResult("Passed"); setComments(""); setTouched(false); }
  }, [open, assignment?.id]);

  if (!assignment) return null;
  const defectId = extractDefectId(assignment.title);
  const cleanTitle = stripDefectTag(assignment.title) || assignment.title;
  const alreadyCompleted = assignment.status === "Completed";
  const trimmedComments = comments.trim();
  const commentsError = touched && !trimmedComments ? "Comments are required." : "";
  const canSubmit = !busy && !alreadyCompleted && trimmedComments.length > 0;

  const submit = async () => {
    if (!currentUser) return;
    setTouched(true);
    if (alreadyCompleted) { toast.error("This retest has already been submitted."); return; }
    const trimmed = trimmedComments;
    if (!trimmed) { toast.error("Please add retest comments before submitting."); return; }
    setBusy(true);
    try {
      const stamp = `[Retest ${result}] ${trimmed}`;
      const newInstructions = `${assignment.instructions || ""}\n\n— ${currentUser.name} @ ${new Date().toLocaleString()}\n${stamp}`.trim();
      const { error: e1 } = await supabase
        .from("retest_assignments")
        .update({ status: "Completed", instructions: newInstructions })
        .eq("id", assignment.id);
      if (e1) { toast.error(`Failed to submit retest: ${e1.message}`); return; }

      if (defectId) {
        try {
          await addComment(defectId, stamp);
          await updateDefect(defectId, {
            status: result === "Passed" ? "Fixed" : "Reopened",
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          toast.error(`Retest saved, but failed to update the linked error: ${msg}`);
          onOpenChange(false);
          return;
        }
      }
      toast.success(`Retest submitted: ${result}`);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unexpected error while submitting.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Retest Result</DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block truncate">{cleanTitle}</span>
            <span className="inline-flex flex-wrap items-center gap-1">
              <Badge variant="outline" className="font-mono text-[10px]">{assignment.id}</Badge>
              {defectId && <Badge variant="secondary" className="font-mono text-[10px]">Error: {defectId}</Badge>}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Result</Label>
            <RadioGroup value={result} onValueChange={(v) => setResult(v as Result)} className="grid grid-cols-2 gap-2">
              <label className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 ${result === "Passed" ? "border-emerald-500/60 bg-emerald-500/5" : ""}`}>
                <RadioGroupItem value="Passed" />
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium">Passed</span>
              </label>
              <label className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 ${result === "Failed" ? "border-destructive/60 bg-destructive/5" : ""}`}>
                <RadioGroupItem value="Failed" />
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium">Failed</span>
              </label>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="retest-comments">
              Comments <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="retest-comments"
              placeholder="Describe what you tested and the outcome…"
              rows={5}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={!!commentsError}
              aria-describedby="retest-comments-error"
              disabled={alreadyCompleted}
              maxLength={2000}
            />
            {commentsError ? (
              <p id="retest-comments-error" className="text-xs text-destructive">{commentsError}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Required. {trimmedComments.length}/2000 characters.</p>
            )}
            {alreadyCompleted && (
              <p className="text-xs text-muted-foreground">This retest has already been submitted and cannot be changed.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Submitting…" : alreadyCompleted ? "Already submitted" : "Submit result"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}