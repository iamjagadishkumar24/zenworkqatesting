import { describe, it, expect } from "vitest";
import type { Defect } from "./types";
import {
  filterDefectsAdmin,
  filterAuditAdmin,
  matchesAuditAction,
  defectHasAttachments,
  defectRetestState,
  canUseCrossAgentFilters,
} from "./adminFilters";
import { scopeForUser, canAccessRoute, canPerformAdminAction } from "./scope";

// ---------- fixtures ----------
function defect(over: Partial<Defect> = {}): Defect {
  return {
    id: "ZEN-2026-01",
    module: "1099 Forms",
    formFeature: "Form 1099-NEC",
    taxYear: "2026",
    title: "Issue",
    description: "",
    stepsToReproduce: "",
    expectedResult: "",
    actualResult: "",
    status: "Reported",
    priority: "Medium",
    severity: "Medium",
    validity: "Unverified",
    environment: "Production",
    assignedAgent: "Alice",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    updatedBy: "Alice",
    createdBy: "Alice",
    comments: [],
    ...over,
  };
}

const D = {
  aliceReported: defect({ id: "D1", createdBy: "Alice", assignedAgent: "Alice" }),
  aliceToBob: defect({
    id: "D2", createdBy: "Alice", assignedAgent: "Bob", priority: "High",
    severity: "High", status: "Retest Required", attachmentUrl: "x.png",
    comments: [{ id: "c", author: "Bob", text: "hi", createdAt: "" }],
    taxYear: "2026",
  }),
  bobToAlice: defect({
    id: "D3", createdBy: "Bob", assignedAgent: "Alice", status: "Retest Passed",
    priority: "Low", severity: "Low", taxYear: "2025",
  }),
  bobToCarol: defect({
    id: "D4", createdBy: "Bob", assignedAgent: "Carol", status: "Closed",
    priority: "Critical", severity: "Critical", taxYear: "2025",
  }),
};

const ALL: Defect[] = [D.aliceReported, D.aliceToBob, D.bobToAlice, D.bobToCarol];

// ---------- Visibility / RBAC ----------
describe("Visibility: agents are restricted to their own defects", () => {
  it("admin can see every reported defect across agents", () => {
    expect(scopeForUser(ALL, { name: "Alice", role: "admin" })).toHaveLength(4);
    expect(scopeForUser(ALL, { name: "Carol", role: "admin" })).toHaveLength(4);
  });

  it("agent only sees defects they reported (never cross-agent)", () => {
    const alice = scopeForUser(ALL, { name: "Alice", role: "agent" });
    expect(alice.map((d) => d.id).sort()).toEqual(["D1", "D2"]);
    const bob = scopeForUser(ALL, { name: "Bob", role: "agent" });
    expect(bob.map((d) => d.id).sort()).toEqual(["D3", "D4"]);
  });

  it("audit log, agents page and reports are admin-only routes", () => {
    for (const p of ["/audit-log", "/agents", "/reports"]) {
      expect(canAccessRoute("admin", p)).toBe(true);
      expect(canAccessRoute("agent", p)).toBe(false);
    }
  });

  it("cross-agent filter UI is admin-only", () => {
    expect(canUseCrossAgentFilters("admin")).toBe(true);
    expect(canUseCrossAgentFilters("agent")).toBe(false);
    expect(canUseCrossAgentFilters(null)).toBe(false);
  });

  it("validate / assign / view-all-audit are gated to admin", () => {
    for (const a of ["validate_defect", "assign_task", "view_all_audit_log"] as const) {
      expect(canPerformAdminAction("admin", a)).toBe(true);
      expect(canPerformAdminAction("agent", a)).toBe(false);
    }
  });
});

// ---------- Admin defect cross-agent filters ----------
describe("Admin defect filters", () => {
  it("filters by assignment", () => {
    const r = filterDefectsAdmin(ALL, { assignedAgent: "Bob" });
    expect(r.map((d) => d.id)).toEqual(["D2"]);
  });

  it("filters by reporter", () => {
    const r = filterDefectsAdmin(ALL, { reporter: "Bob" });
    expect(r.map((d) => d.id).sort()).toEqual(["D3", "D4"]);
  });

  it("filters by tax year", () => {
    expect(filterDefectsAdmin(ALL, { taxYear: "2026" }).map((d) => d.id).sort())
      .toEqual(["D1", "D2"]);
    expect(filterDefectsAdmin(ALL, { taxYear: "2025" }).map((d) => d.id).sort())
      .toEqual(["D3", "D4"]);
  });

  it("filters by status and priority", () => {
    expect(filterDefectsAdmin(ALL, { status: "Closed" }).map((d) => d.id)).toEqual(["D4"]);
    expect(filterDefectsAdmin(ALL, { priority: "High" }).map((d) => d.id)).toEqual(["D2"]);
  });

  it("filters by comment presence", () => {
    expect(filterDefectsAdmin(ALL, { hasComments: "yes" }).map((d) => d.id)).toEqual(["D2"]);
    expect(filterDefectsAdmin(ALL, { hasComments: "no" }).map((d) => d.id).sort())
      .toEqual(["D1", "D3", "D4"]);
    expect(filterDefectsAdmin(ALL, { hasComments: "any" })).toHaveLength(4);
  });

  it("filters by attachment presence", () => {
    expect(defectHasAttachments(D.aliceToBob)).toBe(true);
    expect(defectHasAttachments(D.aliceReported)).toBe(false);
    expect(filterDefectsAdmin(ALL, { hasAttachments: "yes" }).map((d) => d.id)).toEqual(["D2"]);
    expect(filterDefectsAdmin(ALL, { hasAttachments: "no" }).map((d) => d.id).sort())
      .toEqual(["D1", "D3", "D4"]);
  });

  it("filters by retest state", () => {
    expect(defectRetestState("Retest Required")).toBe("required");
    expect(defectRetestState("Retest Passed")).toBe("passed");
    expect(defectRetestState("Retest Failed")).toBe("failed");
    expect(defectRetestState("Closed")).toBe("none");
    expect(filterDefectsAdmin(ALL, { retest: "required" }).map((d) => d.id)).toEqual(["D2"]);
    expect(filterDefectsAdmin(ALL, { retest: "passed" }).map((d) => d.id)).toEqual(["D3"]);
    expect(filterDefectsAdmin(ALL, { retest: "none" }).map((d) => d.id).sort())
      .toEqual(["D1", "D4"]);
  });

  it("combines multiple admin filters across agents", () => {
    const r = filterDefectsAdmin(ALL, {
      assignedAgent: "Bob",
      reporter: "Alice",
      hasAttachments: "yes",
      retest: "required",
    });
    expect(r.map((d) => d.id)).toEqual(["D2"]);
  });

  it("free-text search matches id, title, assignee, reporter", () => {
    expect(filterDefectsAdmin(ALL, { q: "carol" }).map((d) => d.id)).toEqual(["D4"]);
    expect(filterDefectsAdmin(ALL, { q: "d3" }).map((d) => d.id)).toEqual(["D3"]);
  });

  it("treats 'all'/'any' as no-op", () => {
    expect(filterDefectsAdmin(ALL, {
      assignedAgent: "all", reporter: "all", status: "all",
      priority: "all", severity: "all", taxYear: "all",
      hasComments: "any", hasAttachments: "any", retest: "any",
    })).toHaveLength(4);
  });
});

// ---------- Audit log admin filters ----------
describe("Audit log admin filters", () => {
  const rows = [
    { action: "defect.created",          record_type: "defect",  category: "defect",   actor_name: "Alice" },
    { action: "defect.updated",          record_type: "defect",  category: "defect",   actor_name: "Bob" },
    { action: "defect.status_changed",   record_type: "defect",  category: "defect",   actor_name: "Bob" },
    { action: "defect.closed",           record_type: "defect",  category: "defect",   actor_name: "Admin" },
    { action: "defect.reopened",         record_type: "defect",  category: "defect",   actor_name: "Admin" },
    { action: "defect.assigned",         record_type: "defect",  category: "defect",   actor_name: "Admin" },
    { action: "defect.deleted",          record_type: "defect",  category: "defect",   actor_name: "Admin" },
    { action: "task.created",            record_type: "task",    category: "task",     actor_name: "Admin" },
    { action: "task.completed",          record_type: "task",    category: "task",     actor_name: "Alice" },
    { action: "task.reassigned",         record_type: "task",    category: "task",     actor_name: "Admin" },
    { action: "comment.added",           record_type: "comment", category: "comment",  actor_name: "Bob" },
    { action: "export.completed",        record_type: "export",  category: "export",   actor_name: "Admin" },
    { action: "auth.login",              record_type: null,      category: "auth",     actor_name: "Carol" },
  ];

  it("matchesAuditAction recognises action verbs", () => {
    expect(matchesAuditAction("defect.created", "create")).toBe(true);
    expect(matchesAuditAction("task.created", "create")).toBe(true);
    expect(matchesAuditAction("defect.updated", "update")).toBe(true);
    expect(matchesAuditAction("defect.status_changed", "update")).toBe(true);
    expect(matchesAuditAction("defect.closed", "close")).toBe(true);
    expect(matchesAuditAction("task.completed", "close")).toBe(true);
    expect(matchesAuditAction("defect.reopened", "reopen")).toBe(true);
    expect(matchesAuditAction("export.completed", "export")).toBe(true);
    expect(matchesAuditAction("defect.assigned", "assign")).toBe(true);
    expect(matchesAuditAction("defect.deleted", "delete")).toBe(true);
    expect(matchesAuditAction("comment.added", "comment")).toBe(true);
    expect(matchesAuditAction("auth.login", "auth")).toBe(true);
    expect(matchesAuditAction("defect.created", "close")).toBe(false);
    expect(matchesAuditAction("anything", "any")).toBe(true);
  });

  it("filters audit rows by record kind", () => {
    expect(filterAuditAdmin(rows, { recordKind: "defect" })).toHaveLength(7);
    expect(filterAuditAdmin(rows, { recordKind: "task" })).toHaveLength(3);
    expect(filterAuditAdmin(rows, { recordKind: "export" })).toHaveLength(1);
  });

  it("filters audit rows by action verb across agents", () => {
    expect(filterAuditAdmin(rows, { actionKind: "create" }).map((r) => r.action).sort())
      .toEqual(["defect.created", "task.created"]);
    expect(filterAuditAdmin(rows, { actionKind: "close" }).map((r) => r.action).sort())
      .toEqual(["defect.closed", "task.completed"]);
    expect(filterAuditAdmin(rows, { actionKind: "reopen" }).map((r) => r.action))
      .toEqual(["defect.reopened"]);
    expect(filterAuditAdmin(rows, { actionKind: "export" }).map((r) => r.action))
      .toEqual(["export.completed"]);
  });

  it("combines record kind + action + actor for cross-agent narrowing", () => {
    const r = filterAuditAdmin(rows, {
      recordKind: "defect", actionKind: "update", actor: "Bob",
    });
    expect(r.map((x) => x.action).sort()).toEqual(["defect.status_changed", "defect.updated"]);
  });

  it("'any' is a no-op for both record kind and action", () => {
    expect(filterAuditAdmin(rows, { recordKind: "any", actionKind: "any" }))
      .toHaveLength(rows.length);
  });
});