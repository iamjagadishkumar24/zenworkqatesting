import { describe, it, expect } from "vitest";
import {
  canUseCrossAgentFilters,
  defectHasAttachments,
  defectRetestState,
  filterAuditAdmin,
  filterDefectsAdmin,
  matchesAuditAction,
} from "./adminFilters";
import type { Defect } from "./types";

function mkDefect(over: Partial<Defect> = {}): Defect {
  return {
    id: over.id ?? "ZEN-1",
    module: over.module ?? "Forms",
    formFeature: over.formFeature ?? "Form 1099-NEC",
    taxYear: over.taxYear ?? "2025",
    title: over.title ?? "Totals off",
    description: "",
    stepsToReproduce: "",
    expectedResult: "",
    actualResult: "",
    status: over.status ?? "Reported",
    priority: over.priority ?? "Medium",
    severity: over.severity ?? "Medium",
    assignedAgent: over.assignedAgent ?? "Bob",
    createdAt: "",
    updatedAt: "",
    updatedBy: "",
    createdBy: over.createdBy ?? "Alice",
    comments: over.comments ?? [],
    ...over,
  } as Defect;
}

describe("defectHasAttachments", () => {
  it("returns false when every attachment field is empty", () => {
    expect(defectHasAttachments(mkDefect())).toBe(false);
  });
  it("returns true when any single attachment field is set", () => {
    for (const key of [
      "attachmentUrl",
      "attachmentUrl2",
      "evidenceUrl",
      "screenshotUrl",
      "videoUrl",
      "excelUrl",
      "driveUrl",
      "jiraUrl",
    ] as const) {
      expect(defectHasAttachments(mkDefect({ [key]: "x" } as Partial<Defect>))).toBe(true);
    }
  });
});

describe("defectRetestState", () => {
  it("maps retest statuses", () => {
    expect(defectRetestState("Retest Required")).toBe("required");
    expect(defectRetestState("Retest Passed")).toBe("passed");
    expect(defectRetestState("Retest Failed")).toBe("failed");
    expect(defectRetestState("Closed")).toBe("none");
    expect(defectRetestState("Reported")).toBe("none");
  });
});

describe("filterDefectsAdmin", () => {
  const list = [
    mkDefect({ id: "A", module: "Forms", status: "Reported", assignedAgent: "Bob" }),
    mkDefect({
      id: "B",
      module: "1099 Forms", // legacy → matches Forms
      status: "Closed",
      assignedAgent: "Carol",
      taxYear: "2024",
    }),
    mkDefect({
      id: "C",
      module: "Integrations",
      status: "Retest Required",
      assignedAgent: "Bob",
      attachmentUrl: "/x",
      comments: [
        {
          id: "c1",
          author: "x",
          text: "hi",
          createdAt: "",
        },
      ],
    }),
  ];

  it("treats 'all'/'any'/'' as no filter", () => {
    expect(filterDefectsAdmin(list, {}).length).toBe(3);
    expect(filterDefectsAdmin(list, { assignedAgent: "all" }).length).toBe(3);
    expect(filterDefectsAdmin(list, { module: "any" }).length).toBe(3);
  });
  it("filters by assigned agent exactly", () => {
    const res = filterDefectsAdmin(list, { assignedAgent: "Bob" });
    expect(res.map((d) => d.id).sort()).toEqual(["A", "C"]);
  });
  it("expands Forms module to its legacy aliases", () => {
    const res = filterDefectsAdmin(list, { module: "Forms" });
    expect(res.map((d) => d.id).sort()).toEqual(["A", "B"]);
  });
  it("filters by status, priority and tax year", () => {
    expect(filterDefectsAdmin(list, { status: "Closed" }).map((d) => d.id)).toEqual(["B"]);
    expect(filterDefectsAdmin(list, { taxYear: "2024" }).map((d) => d.id)).toEqual(["B"]);
  });
  it("filters by presence of comments and attachments", () => {
    expect(filterDefectsAdmin(list, { hasComments: "yes" }).map((d) => d.id)).toEqual(["C"]);
    expect(filterDefectsAdmin(list, { hasComments: "no" }).map((d) => d.id).sort()).toEqual([
      "A",
      "B",
    ]);
    expect(filterDefectsAdmin(list, { hasAttachments: "yes" }).map((d) => d.id)).toEqual(["C"]);
  });
  it("filters by retest state", () => {
    expect(filterDefectsAdmin(list, { retest: "required" }).map((d) => d.id)).toEqual(["C"]);
    expect(filterDefectsAdmin(list, { retest: "none" }).map((d) => d.id).sort()).toEqual([
      "A",
      "B",
    ]);
  });
  it("performs case-insensitive search across id/title/module/agent", () => {
    expect(filterDefectsAdmin(list, { q: "carol" }).map((d) => d.id)).toEqual(["B"]);
    expect(filterDefectsAdmin(list, { q: "integrations" }).map((d) => d.id)).toEqual(["C"]);
  });
});

describe("matchesAuditAction", () => {
  it("any/falsy kinds match every action", () => {
    expect(matchesAuditAction("defect.created", "any")).toBe(true);
    expect(matchesAuditAction("anything.weird", "any")).toBe(true);
  });
  it("create matches *.created", () => {
    expect(matchesAuditAction("defect.created", "create")).toBe(true);
    expect(matchesAuditAction("task.created", "create")).toBe(true);
    expect(matchesAuditAction("defect.updated", "create")).toBe(false);
  });
  it("update matches updates, reassignments and status-like changes", () => {
    expect(matchesAuditAction("defect.status_changed", "update")).toBe(true);
    expect(matchesAuditAction("defect.assigned", "update")).toBe(true);
    expect(matchesAuditAction("task.reassigned", "update")).toBe(true);
    expect(matchesAuditAction("defect.created", "update")).toBe(false);
  });
  it("close, reopen, export, assign, delete, comment, auth", () => {
    expect(matchesAuditAction("defect.closed", "close")).toBe(true);
    expect(matchesAuditAction("task.completed", "close")).toBe(true);
    expect(matchesAuditAction("defect.reopened", "reopen")).toBe(true);
    expect(matchesAuditAction("export.csv", "export")).toBe(true);
    expect(matchesAuditAction("defect.assigned", "assign")).toBe(true);
    expect(matchesAuditAction("defect.deleted", "delete")).toBe(true);
    expect(matchesAuditAction("comment.added", "comment")).toBe(true);
    expect(matchesAuditAction("auth.login", "auth")).toBe(true);
    expect(matchesAuditAction("auth.login", "comment")).toBe(false);
  });
});

describe("filterAuditAdmin", () => {
  const rows = [
    { action: "defect.created", record_type: "defect", category: "defect", actor_name: "Alice" },
    { action: "task.reassigned", record_type: "task", category: "task", actor_name: "Bob" },
    { action: "comment.added", record_type: null, category: "comment", actor_name: "Alice" },
  ];
  it("filters by record kind, falling back to category when record_type is null", () => {
    expect(filterAuditAdmin(rows, { recordKind: "comment" }).length).toBe(1);
    expect(filterAuditAdmin(rows, { recordKind: "defect" }).length).toBe(1);
  });
  it("filters by actor name; 'all' disables", () => {
    expect(filterAuditAdmin(rows, { actor: "Alice" }).length).toBe(2);
    expect(filterAuditAdmin(rows, { actor: "all" }).length).toBe(3);
  });
  it("combines action + record + actor filters", () => {
    expect(
      filterAuditAdmin(rows, { actionKind: "update", recordKind: "task", actor: "Bob" }).length,
    ).toBe(1);
  });
});

describe("canUseCrossAgentFilters", () => {
  it("only admins are allowed", () => {
    expect(canUseCrossAgentFilters("admin")).toBe(true);
    expect(canUseCrossAgentFilters("agent")).toBe(false);
    expect(canUseCrossAgentFilters(null)).toBe(false);
    expect(canUseCrossAgentFilters(undefined)).toBe(false);
  });
});