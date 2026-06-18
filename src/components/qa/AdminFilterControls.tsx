// Pure presentational filter controls for admin-only cross-agent narrowing.
// Extracted so they can be unit-tested independently of the route shell
// and so the same `isAdmin` gate guards both rendering and behaviour.
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Lock } from "lucide-react";
import type {
  AuditActionKind, AuditRecordKind, Presence, RetestState,
} from "@/lib/qa/adminFilters";

type Opt = { v: string; l: string };

/**
 * Inline unauthorized notice shown to QA agents in place of admin-only
 * cross-agent filter controls. Explains *why* the controls are missing
 * without affecting the agent's own single-agent view.
 */
function UnauthorizedFilterNotice({
  scope, testId,
}: { scope: "defect" | "audit"; testId: string }) {
  const label = scope === "defect"
    ? "Cross-agent defect filters are admin-only"
    : "Admin-only audit filters";
  const detail = scope === "defect"
    ? "Only administrators can filter defects across other agents. Your view continues to show the records assigned to or reported by you."
    : "Only administrators can pivot the audit log by actor, record type, or action. Your view continues to show audit events scoped to your account.";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-testid={testId}
            role="note"
            aria-label={label}
            tabIndex={0}
            className="inline-flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/40 px-3 py-2 text-xs text-muted-foreground cursor-help select-none"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{label}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {detail}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function FilterSelect({
  value, onChange, placeholder, options, ariaLabel,
}: { value: string; onChange: (v: string) => void; placeholder: string; options: Opt[]; ariaLabel: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export type DefectAdminFilterProps = {
  isAdmin: boolean;
  agents: string[];
  reporters: string[];
  years: string[];
  values: {
    agent: string; reporter: string; sev: string; year: string;
    hasComments: Presence; hasAttach: Presence; retest: RetestState;
  };
  onChange: {
    agent: (v: string) => void;
    reporter: (v: string) => void;
    sev: (v: string) => void;
    year: (v: string) => void;
    hasComments: (v: Presence) => void;
    hasAttach: (v: Presence) => void;
    retest: (v: RetestState) => void;
  };
};

/** Admin-only cross-agent defect filters. Renders nothing for agents. */
export function AdminDefectFilterControls(props: DefectAdminFilterProps) {
  if (!props.isAdmin) {
    return <UnauthorizedFilterNotice scope="defect" testId="admin-defect-filters-locked" />;
  }
  const { values: v, onChange: o, agents, reporters, years } = props;
  const SEVS = ["Low", "Medium", "High", "Critical"];
  return (
    <div data-testid="admin-defect-filters" className="contents">
      <FilterSelect ariaLabel="Assigned" value={v.agent} onChange={o.agent} placeholder="Assigned"
        options={[{ v: "all", l: "All agents" }, ...agents.map((a) => ({ v: a, l: a }))]} />
      <FilterSelect ariaLabel="Reported by" value={v.reporter} onChange={o.reporter} placeholder="Reported by"
        options={[{ v: "all", l: "All reporters" }, ...reporters.map((a) => ({ v: a, l: a }))]} />
      <FilterSelect ariaLabel="Severity" value={v.sev} onChange={o.sev} placeholder="Severity"
        options={[{ v: "all", l: "All severities" }, ...SEVS.map((s) => ({ v: s, l: s }))]} />
      <FilterSelect ariaLabel="Tax year" value={v.year} onChange={o.year} placeholder="Tax year"
        options={[{ v: "all", l: "All tax years" }, ...years.map((y) => ({ v: y, l: y }))]} />
      <FilterSelect ariaLabel="Comments" value={v.hasComments} onChange={(x) => o.hasComments(x as Presence)} placeholder="Comments"
        options={[{ v: "any", l: "Any comments" }, { v: "yes", l: "Has comments" }, { v: "no", l: "No comments" }]} />
      <FilterSelect ariaLabel="Attachments" value={v.hasAttach} onChange={(x) => o.hasAttach(x as Presence)} placeholder="Attachments"
        options={[{ v: "any", l: "Any attachments" }, { v: "yes", l: "Has attachments" }, { v: "no", l: "No attachments" }]} />
      <FilterSelect ariaLabel="Retest" value={v.retest} onChange={(x) => o.retest(x as RetestState)} placeholder="Retest"
        options={[
          { v: "any", l: "Any retest state" },
          { v: "required", l: "Retest required" },
          { v: "passed", l: "Retest passed" },
          { v: "failed", l: "Retest failed" },
          { v: "none", l: "No retest" },
        ]} />
    </div>
  );
}

export type AuditAdminFilterProps = {
  isAdmin: boolean;
  actors: string[];
  values: { actor: string; recordKind: AuditRecordKind; actionKind: AuditActionKind };
  onChange: {
    actor: (v: string) => void;
    recordKind: (v: AuditRecordKind) => void;
    actionKind: (v: AuditActionKind) => void;
  };
};

/** Admin-only Audit Log filters. Renders nothing for agents. */
export function AdminAuditFilterControls(props: AuditAdminFilterProps) {
  if (!props.isAdmin) {
    return <UnauthorizedFilterNotice scope="audit" testId="admin-audit-filters-locked" />;
  }
  const { values: v, onChange: o, actors } = props;
  return (
    <div data-testid="admin-audit-filters" className="contents">
      <FilterSelect ariaLabel="Actor" value={v.actor} onChange={o.actor} placeholder="Actor"
        options={[{ v: "all", l: "All actors" }, ...actors.map((a) => ({ v: a, l: a }))]} />
      <FilterSelect ariaLabel="Record type" value={v.recordKind} onChange={(x) => o.recordKind(x as AuditRecordKind)} placeholder="Record type"
        options={[
          { v: "any", l: "All record types" },
          { v: "defect", l: "Defects" },
          { v: "task", l: "Tasks" },
          { v: "comment", l: "Comments" },
          { v: "user", l: "Users" },
          { v: "export", l: "Exports" },
          { v: "role", l: "Roles" },
        ]} />
      <FilterSelect ariaLabel="Action" value={v.actionKind} onChange={(x) => o.actionKind(x as AuditActionKind)} placeholder="Action"
        options={[
          { v: "any", l: "All actions" },
          { v: "create", l: "Create" },
          { v: "update", l: "Update" },
          { v: "assign", l: "Assign / Reassign" },
          { v: "close", l: "Close / Complete" },
          { v: "reopen", l: "Reopen" },
          { v: "export", l: "Export" },
          { v: "delete", l: "Delete" },
          { v: "comment", l: "Comment" },
          { v: "auth", l: "Auth" },
        ]} />
    </div>
  );
}