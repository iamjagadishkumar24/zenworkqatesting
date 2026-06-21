// Pure, dependency-free filter helpers used by the Admin views on the
// Defects and Audit Log pages. Kept here so they can be unit-tested in
// isolation without React or Supabase.

import type { Defect, DefectStatus, Priority, Severity } from "./types";
import {
  FORMS_MODULE,
  LEGACY_FORM_MODULES,
  ONLINE_1099_MODULE,
  LEGACY_ONLINE_1099_MODULES,
} from "./constants";

export type RetestState = "any" | "required" | "passed" | "failed" | "none";
export type Presence = "any" | "yes" | "no";

export type AdminDefectFilters = {
  q?: string;
  assignedAgent?: string; // "" | "all" -> any
  reporter?: string;
  module?: string;
  taxYear?: string;
  status?: DefectStatus | "all";
  priority?: Priority | "all";
  severity?: Severity | "all";
  hasComments?: Presence;
  hasAttachments?: Presence;
  retest?: RetestState;
};

type AttachKeys = Pick<
  Defect,
  | "attachmentUrl"
  | "attachmentUrl2"
  | "evidenceUrl"
  | "screenshotUrl"
  | "videoUrl"
  | "excelUrl"
  | "driveUrl"
  | "jiraUrl"
>;

export function defectHasAttachments(d: AttachKeys): boolean {
  return Boolean(
    d.attachmentUrl ||
    d.attachmentUrl2 ||
    d.evidenceUrl ||
    d.screenshotUrl ||
    d.videoUrl ||
    d.excelUrl ||
    d.driveUrl ||
    d.jiraUrl,
  );
}

export function defectRetestState(status: DefectStatus): RetestState {
  if (status === "Retest Required") return "required";
  if (status === "Retest Passed") return "passed";
  if (status === "Retest Failed") return "failed";
  return "none";
}

function isAny(v: string | undefined): boolean {
  return !v || v === "all" || v === "any";
}

export function filterDefectsAdmin<T extends Defect>(defects: T[], f: AdminDefectFilters): T[] {
  const term = (f.q ?? "").trim().toLowerCase();
  return defects.filter((d) => {
    if (!isAny(f.assignedAgent) && d.assignedAgent !== f.assignedAgent) return false;
    if (!isAny(f.reporter) && d.createdBy !== f.reporter) return false;
    if (!isAny(f.module)) {
      const wantsForms = f.module === FORMS_MODULE;
      const wantsOnline1099 = f.module === ONLINE_1099_MODULE;
      const matches = wantsForms
        ? d.module === FORMS_MODULE || LEGACY_FORM_MODULES.includes(d.module as string)
        : wantsOnline1099
          ? d.module === ONLINE_1099_MODULE ||
            LEGACY_ONLINE_1099_MODULES.includes(d.module as string)
          : d.module === f.module;
      if (!matches) return false;
    }
    if (!isAny(f.taxYear) && (d.taxYear ?? "") !== f.taxYear) return false;
    if (!isAny(f.status) && d.status !== f.status) return false;
    if (!isAny(f.priority) && d.priority !== f.priority) return false;
    if (!isAny(f.severity) && d.severity !== f.severity) return false;

    if (f.hasComments && f.hasComments !== "any") {
      const has = (d.comments?.length ?? 0) > 0;
      if (f.hasComments === "yes" && !has) return false;
      if (f.hasComments === "no" && has) return false;
    }
    if (f.hasAttachments && f.hasAttachments !== "any") {
      const has = defectHasAttachments(d);
      if (f.hasAttachments === "yes" && !has) return false;
      if (f.hasAttachments === "no" && has) return false;
    }
    if (f.retest && f.retest !== "any") {
      if (defectRetestState(d.status) !== f.retest) return false;
    }

    if (!term) return true;
    const hay = [
      d.id,
      d.title,
      d.formFeature,
      d.module,
      d.status,
      d.priority,
      d.severity,
      d.assignedAgent,
      d.createdBy,
      d.taxYear ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(term);
  });
}

// ----------------- Audit Log -----------------

export type AuditActionKind =
  | "any"
  | "create"
  | "update"
  | "close"
  | "reopen"
  | "export"
  | "assign"
  | "delete"
  | "comment"
  | "auth";

export type AuditRecordKind = "any" | "defect" | "task" | "comment" | "user" | "export" | "role";

export type AdminAuditFilters = {
  actionKind?: AuditActionKind;
  recordKind?: AuditRecordKind;
  actor?: string; // exact actor_name match; "all"/"" disables
};

const ACTION_RULES: Record<Exclude<AuditActionKind, "any">, (action: string) => boolean> = {
  create: (a) => /\.created$/.test(a),
  update: (a) =>
    /\.(updated|changed|status_changed|priority_changed|severity_changed|validity_changed|reassigned)$/.test(
      a,
    ) ||
    /^defect\.(assigned|reassigned)$/.test(a) ||
    /^task\.(reassigned|status_changed)$/.test(a),
  close: (a) => /^(defect|task)\.(closed|completed)$/.test(a),
  reopen: (a) => /\.(reopened)$/.test(a),
  export: (a) => a.startsWith("export."),
  assign: (a) => /\.(assigned|reassigned)$/.test(a),
  delete: (a) => /\.(deleted|removed)$/.test(a),
  comment: (a) => a.startsWith("comment."),
  auth: (a) => a.startsWith("auth."),
};

export function matchesAuditAction(action: string, kind: AuditActionKind): boolean {
  if (!kind || kind === "any") return true;
  return ACTION_RULES[kind](action);
}

type AuditRowShape = {
  action: string;
  record_type: string | null;
  category: string;
  actor_name: string | null;
};

export function filterAuditAdmin<T extends AuditRowShape>(rows: T[], f: AdminAuditFilters): T[] {
  return rows.filter((r) => {
    if (f.recordKind && f.recordKind !== "any") {
      const rt = (r.record_type ?? r.category ?? "").toLowerCase();
      if (rt !== f.recordKind) return false;
    }
    if (f.actor && f.actor !== "all" && (r.actor_name ?? "") !== f.actor) return false;
    return matchesAuditAction(r.action, f.actionKind ?? "any");
  });
}

// Gate cross-agent filtering UI — agents must never see other agents' data.
export function canUseCrossAgentFilters(role: "admin" | "agent" | null | undefined): boolean {
  return role === "admin";
}
