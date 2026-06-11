import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertTriangle, Hourglass, Clock, RefreshCw } from "lucide-react";
import type { TestStatus, DefectStatus, Priority, Severity } from "@/lib/qa/types";

const testMap: Record<TestStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
  Passed: { cls: "bg-success/10 text-success border-success/20", Icon: CheckCircle2 },
  Failed: { cls: "bg-destructive/10 text-destructive border-destructive/20", Icon: XCircle },
  "Open Bug": { cls: "bg-warning/15 text-warning-foreground border-warning/30", Icon: AlertTriangle },
  "In Progress": { cls: "bg-info/10 text-info border-info/20", Icon: Hourglass },
  Pending: { cls: "bg-muted text-muted-foreground border-border", Icon: Clock },
  "Retest Required": { cls: "bg-accent text-accent-foreground border-border", Icon: RefreshCw },
};

const testLabelMap: Record<TestStatus, string> = {
  Passed: "Valid",
  Failed: "Invalid Errors",
  "Open Bug": "Open Errors",
  "In Progress": "In Progress",
  Pending: "Pending",
  "Retest Required": "Retest Required",
};

export function TestStatusBadge({ status, className }: { status: TestStatus; className?: string }) {
  const { cls, Icon } = testMap[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        cls,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {testLabelMap[status]}
    </span>
  );
}

const defectMap: Record<DefectStatus, string> = {
  Reported: "bg-info/10 text-info border-info/20",
  Pending: "bg-muted text-muted-foreground border-border",
  Ongoing: "bg-warning/15 text-warning-foreground border-warning/30",
  "In Progress": "bg-info/10 text-info border-info/20",
  Fixed: "bg-success/10 text-success border-success/20",
  "Retest Required": "bg-accent text-accent-foreground border-border",
  Reopened: "bg-destructive/10 text-destructive border-destructive/20",
  Closed: "bg-muted text-muted-foreground border-border",
};

export function DefectStatusBadge({ status }: { status: DefectStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        defectMap[status],
      )}
    >
      {status}
    </span>
  );
}

const pMap: Record<Priority, string> = {
  Low: "bg-muted text-muted-foreground",
  Medium: "bg-info/10 text-info",
  High: "bg-warning/15 text-warning-foreground",
  Critical: "bg-destructive/10 text-destructive",
};

export function PriorityBadge({ value }: { value: Priority | Severity }) {
  return (
    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", pMap[value])}>
      {value}
    </span>
  );
}
