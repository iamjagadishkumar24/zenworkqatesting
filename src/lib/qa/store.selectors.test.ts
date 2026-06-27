import { describe, expect, it } from "vitest";
import {
  applyDefectPreset,
  computeAgentWorkloadMetrics,
  computeDashboardStats,
  groupDefectsByField,
  scopeDefectsForDashboard,
  searchDefects,
  sortDefectsByUpdatedAt,
} from "./store";
import type { Defect, User } from "./types";

function mkDefect(over: Partial<Defect> = {}): Defect {
  return {
    id: over.id ?? "ZEN-2026-01",
    module: over.module ?? "Forms",
    formFeature: over.formFeature ?? "Form 1099-NEC",
    taxYear: over.taxYear ?? "2026",
    title: over.title ?? "Totals mismatch",
    description: "",
    stepsToReproduce: "",
    expectedResult: "",
    actualResult: "",
    status: over.status ?? "Reported",
    priority: over.priority ?? "Medium",
    severity: over.severity ?? "Medium",
    validity: over.validity ?? "Unverified",
    environment: over.environment ?? "Production",
    assignedAgent: over.assignedAgent ?? "Alice Agent",
    createdAt: over.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: over.updatedAt ?? "2026-01-01T00:00:00.000Z",
    updatedBy: over.updatedBy ?? "Alice Agent",
    createdBy: over.createdBy ?? "Alice Agent",
    comments: over.comments ?? [],
    ...over,
  };
}

const users: User[] = [
  { id: "u-admin", name: "Admin", email: "admin@example.test", role: "admin", active: true },
  { id: "u-alice", name: "Alice Agent", email: "alice@example.test", role: "agent", active: true },
  { id: "u-bob", name: "Bob Agent", email: "bob@example.test", role: "agent", active: true },
  { id: "u-off", name: "Offboarded", email: "off@example.test", role: "agent", active: false },
];

describe("store selectors: dashboard counts", () => {
  it("computes open, valid, invalid, fixed and retest buckets from one defect set", () => {
    const defects = [
      mkDefect({ id: "reported", status: "Reported", validity: "Valid" }),
      mkDefect({ id: "closed", status: "Closed", validity: "Invalid" }),
      mkDefect({ id: "fixed", status: "Fixed", validity: "Valid" }),
      mkDefect({ id: "retest", status: "Retest Required", validity: "Unverified" }),
      mkDefect({ id: "reopened", status: "Reopened", validity: "Invalid" }),
    ];

    expect(computeDashboardStats(defects)).toEqual({
      total: 5,
      open: 3,
      valid: 2,
      invalid: 2,
      fixed: 2,
      retest: 1,
    });
  });

  it("preserves status-bucket invariants after workflow transitions", () => {
    const before = [
      mkDefect({ id: "a", status: "Reported" }),
      mkDefect({ id: "b", status: "Retest Required" }),
      mkDefect({ id: "c", status: "Closed" }),
    ];
    const after = before.map((d) => (d.id === "a" ? { ...d, status: "Fixed" as const } : d));

    expect(computeDashboardStats(after).open).toBe(computeDashboardStats(before).open - 1);
    expect(computeDashboardStats(after).fixed).toBe(computeDashboardStats(before).fixed + 1);
    expect(computeDashboardStats(after).open + computeDashboardStats(after).fixed).toBe(
      after.length,
    );
  });
});

describe("store selectors: scoped dashboard data", () => {
  const defects = [
    mkDefect({
      id: "prod-2026-alice",
      createdBy: "Alice Agent",
      environment: "Production",
      taxYear: "2026",
    }),
    mkDefect({
      id: "stage-2026-alice",
      createdBy: "Alice Agent",
      environment: "Stage",
      taxYear: "2026",
    }),
    mkDefect({
      id: "prod-2025-bob",
      createdBy: "Bob Agent",
      environment: "Production",
      taxYear: "2025",
    }),
    mkDefect({
      id: "global-2026-bob",
      createdBy: "Bob Agent",
      environment: undefined,
      taxYear: "2026",
    }),
  ];

  it("lets admins see environment and tax-year scoped defects, including global rows", () => {
    const scoped = scopeDefectsForDashboard(
      defects,
      { name: "Admin", role: "admin" },
      "Production",
      "2026",
    );

    expect(scoped.map((d) => d.id).sort()).toEqual(["global-2026-bob", "prod-2026-alice"]);
  });

  it("limits agents to their own reported defects before env/year filters", () => {
    const scoped = scopeDefectsForDashboard(
      defects,
      { name: "Alice Agent", role: "agent" },
      null,
      "all",
    );

    expect(scoped.map((d) => d.id).sort()).toEqual(["prod-2026-alice", "stage-2026-alice"]);
  });

  it("returns no rows without an authenticated user", () => {
    expect(scopeDefectsForDashboard(defects, null, "Production", "2026")).toEqual([]);
  });
});

describe("store selectors: list presets and search", () => {
  const defects = [
    mkDefect({ id: "ZEN-1", title: "NEC payer mismatch", status: "Reported", validity: "Valid" }),
    mkDefect({
      id: "ZEN-2",
      title: "K form export",
      formFeature: "Form 1099-K",
      status: "Closed",
      validity: "Invalid",
      assignedAgent: "Bob Agent",
    }),
    mkDefect({
      id: "ZEN-3",
      module: "Integrations",
      title: "QuickBooks sync",
      status: "Retest Required",
      createdBy: "Carol Reporter",
      taxYear: "2025",
    }),
  ];

  it.each([
    ["all", ["ZEN-1", "ZEN-2", "ZEN-3"]],
    ["open", ["ZEN-1", "ZEN-3"]],
    ["valid", ["ZEN-1"]],
    ["invalid", ["ZEN-2"]],
    ["fixed", ["ZEN-2"]],
    ["retest", ["ZEN-3"]],
  ] as const)("applies %s preset", (preset, ids) => {
    expect(applyDefectPreset(defects, preset).map((d) => d.id)).toEqual(ids);
  });

  it("treats empty or unknown preset/search terms as defensive no-ops", () => {
    expect(applyDefectPreset(defects, undefined).map((d) => d.id)).toEqual([
      "ZEN-1",
      "ZEN-2",
      "ZEN-3",
    ]);
    expect(applyDefectPreset(defects, "bogus").map((d) => d.id)).toEqual([
      "ZEN-1",
      "ZEN-2",
      "ZEN-3",
    ]);
    expect(searchDefects(defects, "   ").map((d) => d.id)).toEqual(["ZEN-1", "ZEN-2", "ZEN-3"]);
  });

  it("searches across id, title, form, module, assignee, reporter and tax year", () => {
    expect(searchDefects(defects, "zen-2").map((d) => d.id)).toEqual(["ZEN-2"]);
    expect(searchDefects(defects, "payer").map((d) => d.id)).toEqual(["ZEN-1"]);
    expect(searchDefects(defects, "1099-k").map((d) => d.id)).toEqual(["ZEN-2"]);
    expect(searchDefects(defects, "integrations").map((d) => d.id)).toEqual(["ZEN-3"]);
    expect(searchDefects(defects, "bob agent").map((d) => d.id)).toEqual(["ZEN-2"]);
    expect(searchDefects(defects, "carol reporter").map((d) => d.id)).toEqual(["ZEN-3"]);
    expect(searchDefects(defects, "2025").map((d) => d.id)).toEqual(["ZEN-3"]);
  });
});

describe("store selectors: grouped and sorted derived views", () => {
  it("groups defects by requested field with fallback for blank values", () => {
    const grouped = groupDefectsByField(
      [
        mkDefect({ id: "a", module: "Forms" }),
        mkDefect({ id: "b", module: "Forms" }),
        mkDefect({ id: "c", module: "Integrations" }),
        mkDefect({ id: "d", formFeature: "" }),
      ],
      "formFeature",
      "No form",
    );

    expect(grouped["Form 1099-NEC"].map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(grouped["No form"].map((d) => d.id)).toEqual(["d"]);
  });

  it("sorts by updatedAt descending by default and uses id as a stable tie-breaker", () => {
    const defects = [
      mkDefect({ id: "b", updatedAt: "2026-01-02T00:00:00.000Z" }),
      mkDefect({ id: "c", updatedAt: "2026-01-03T00:00:00.000Z" }),
      mkDefect({ id: "a", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];

    expect(sortDefectsByUpdatedAt(defects).map((d) => d.id)).toEqual(["c", "b", "a"]);
    expect(sortDefectsByUpdatedAt(defects, "asc").map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(defects.map((d) => d.id)).toEqual(["b", "c", "a"]);
  });
});

describe("store selectors: agent workload metrics", () => {
  it("aggregates assigned, completed, review and retest workload per active agent", () => {
    const defects = [
      mkDefect({
        id: "a",
        assignedAgent: "Alice Agent",
        status: "Reported",
        validity: "Unverified",
        createdBy: "Alice Agent",
      }),
      mkDefect({
        id: "b",
        assignedAgent: "Alice Agent",
        status: "Closed",
        validity: "Valid",
        createdBy: "Bob Agent",
      }),
      mkDefect({
        id: "c",
        assignedAgent: "Bob Agent",
        status: "Retest Required",
        validity: "Invalid",
        createdBy: "Alice Agent",
      }),
      mkDefect({
        id: "d",
        assignedAgent: "Offboarded",
        status: "Reported",
        createdBy: "Offboarded",
      }),
    ];
    const retests = [
      { assigned_agent_id: "u-alice", assigned_agent_name: "Alice Agent", status: "Pending" },
      { assigned_agent_id: "u-alice", assigned_agent_name: "Alice Agent", status: "Completed" },
      { assigned_agent_id: "u-bob", assigned_agent_name: "Bob Agent", status: "In Progress" },
    ];

    const metrics = computeAgentWorkloadMetrics(users, defects, retests);

    expect(metrics.map((m) => m.name)).toEqual(["Alice Agent", "Bob Agent"]);
    expect(metrics.find((m) => m.name === "Alice Agent")).toMatchObject({
      assignedDefects: 2,
      openAssignedDefects: 1,
      completedDefects: 1,
      reportedDefects: 2,
      pendingReviewDefects: 1,
      activeRetests: 1,
      completedRetests: 1,
      totalOpenWorkload: 2,
    });
    expect(metrics.find((m) => m.name === "Bob Agent")).toMatchObject({
      assignedDefects: 1,
      openAssignedDefects: 1,
      completedDefects: 0,
      reportedDefects: 1,
      pendingReviewDefects: 0,
      activeRetests: 1,
      completedRetests: 0,
      totalOpenWorkload: 2,
    });
  });
});
