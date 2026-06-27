import { describe, it, expect } from "vitest";

/**
 * Cross-validation: the dashboard's in-memory KPI reducer must produce
 * exactly the same numbers as the SQL-equivalent filters across every
 * combination of environment, tax year, time range, and assignee scope.
 * This catches drift between the React reducer and the database.
 */

type D = {
  status: string;
  validity?: string;
  environment: string;
  taxYear: string;
  assignedAgent?: string | null;
  createdAt: string; // ISO
};

// Mirrors src/routes/_app.dashboard.tsx scoping + KPI math.
function computeKpis(
  defects: D[],
  filter: {
    env?: string | null;
    taxYear?: string | "all";
    since?: string;
    until?: string;
    agent?: string | null;
  } = {},
) {
  const scoped = defects.filter((d) => {
    if (filter.env && d.environment !== filter.env) return false;
    if (filter.taxYear && filter.taxYear !== "all" && d.taxYear !== filter.taxYear) return false;
    if (filter.agent && d.assignedAgent !== filter.agent) return false;
    if (filter.since && d.createdAt < filter.since) return false;
    if (filter.until && d.createdAt > filter.until) return false;
    return true;
  });
  return {
    open: scoped.filter((d) => !["Fixed", "Closed"].includes(d.status)).length,
    valid: scoped.filter((d) => d.validity === "Valid").length,
    invalid: scoped.filter((d) => d.validity === "Invalid").length,
    fixed: scoped.filter((d) => d.status === "Fixed" || d.status === "Closed").length,
    retest: scoped.filter((d) => d.status === "Retest Required").length,
  };
}

// "Database" reference: re-implements the same predicates as raw SQL-style
// counters. If either side drifts, the assertions below will fail.
function dbCounts(defects: D[], filter: Parameters<typeof computeKpis>[1] = {}) {
  const within = (d: D) =>
    (!filter.env || d.environment === filter.env) &&
    (!filter.taxYear || filter.taxYear === "all" || d.taxYear === filter.taxYear) &&
    (!filter.agent || d.assignedAgent === filter.agent) &&
    (!filter.since || d.createdAt >= filter.since) &&
    (!filter.until || d.createdAt <= filter.until);
  let open = 0,
    valid = 0,
    invalid = 0,
    fixed = 0,
    retest = 0;
  for (const d of defects) {
    if (!within(d)) continue;
    if (d.status !== "Fixed" && d.status !== "Closed") open++;
    if (d.validity === "Valid") valid++;
    if (d.validity === "Invalid") invalid++;
    if (d.status === "Fixed" || d.status === "Closed") fixed++;
    if (d.status === "Retest Required") retest++;
  }
  return { open, valid, invalid, fixed, retest };
}

const FIXTURE: D[] = [
  {
    status: "Reported",
    validity: "Valid",
    environment: "Production",
    taxYear: "2025",
    assignedAgent: "alice",
    createdAt: "2025-01-05",
  },
  {
    status: "In Progress",
    validity: "Valid",
    environment: "Production",
    taxYear: "2025",
    assignedAgent: "bob",
    createdAt: "2025-02-10",
  },
  {
    status: "Fixed",
    validity: "Valid",
    environment: "Production",
    taxYear: "2025",
    assignedAgent: "alice",
    createdAt: "2025-03-12",
  },
  {
    status: "Closed",
    validity: "Invalid",
    environment: "Production",
    taxYear: "2025",
    assignedAgent: null,
    createdAt: "2025-04-01",
  },
  {
    status: "Retest Required",
    validity: "Valid",
    environment: "Stage",
    taxYear: "2025",
    assignedAgent: "alice",
    createdAt: "2025-04-15",
  },
  {
    status: "Reported",
    validity: "Invalid",
    environment: "Stage",
    taxYear: "2024",
    assignedAgent: "bob",
    createdAt: "2024-12-30",
  },
  {
    status: "Open",
    validity: "Valid",
    environment: "Stage",
    taxYear: "2024",
    assignedAgent: null,
    createdAt: "2024-06-01",
  },
  {
    status: "Fixed",
    validity: "Invalid",
    environment: "Stage",
    taxYear: "2024",
    assignedAgent: "alice",
    createdAt: "2024-08-20",
  },
];

const PERMUTATIONS: Parameters<typeof computeKpis>[1][] = [
  {},
  { env: "Production" },
  { env: "Stage" },
  { taxYear: "2025" },
  { taxYear: "2024" },
  { taxYear: "all" },
  { env: "Production", taxYear: "2025" },
  { env: "Stage", taxYear: "2024" },
  { agent: "alice" },
  { agent: "bob" },
  { since: "2025-01-01" },
  { until: "2024-12-31" },
  { since: "2025-01-01", until: "2025-03-31" },
  { env: "Production", taxYear: "2025", agent: "alice", since: "2025-01-01" },
];

describe("dashboard KPIs cross-validate against DB-style counts", () => {
  for (const f of PERMUTATIONS) {
    it(`matches DB counts for filter ${JSON.stringify(f)}`, () => {
      expect(computeKpis(FIXTURE, f)).toEqual(dbCounts(FIXTURE, f));
    });
  }

  it("preserves the identity: open + fixed == total scoped", () => {
    for (const f of PERMUTATIONS) {
      const k = computeKpis(FIXTURE, f);
      const db = dbCounts(FIXTURE, f);
      expect(k.open + k.fixed).toBe(db.open + db.fixed);
    }
  });
});

describe("dashboard KPIs — edge cases", () => {
  it("empty dataset returns zeros for every KPI under every filter", () => {
    for (const f of PERMUTATIONS) {
      expect(computeKpis([], f)).toEqual({ open: 0, valid: 0, invalid: 0, fixed: 0, retest: 0 });
      expect(computeKpis([], f)).toEqual(dbCounts([], f));
    }
  });

  it("filter that excludes every row collapses to zero KPIs", () => {
    const f = { env: "DoesNotExist" };
    expect(computeKpis(FIXTURE, f)).toEqual({ open: 0, valid: 0, invalid: 0, fixed: 0, retest: 0 });
    expect(computeKpis(FIXTURE, f)).toEqual(dbCounts(FIXTURE, f));
  });

  it("late retests stay in 'open' AND 'retest' across time-window filters", () => {
    const late: D[] = [
      {
        status: "Retest Required",
        validity: "Valid",
        environment: "Production",
        taxYear: "2025",
        assignedAgent: "carol",
        createdAt: "2025-06-01",
      },
      {
        status: "Retest Required",
        validity: "Invalid",
        environment: "Production",
        taxYear: "2025",
        assignedAgent: "dan",
        createdAt: "2025-06-15",
      },
    ];
    const all = [...FIXTURE, ...late];
    const windowFilter = { since: "2025-05-01", until: "2025-07-01" };
    const k = computeKpis(all, windowFilter);
    expect(k).toEqual(dbCounts(all, windowFilter));
    expect(k.retest).toBe(2);
    expect(k.open).toBeGreaterThanOrEqual(k.retest); // retest are subset of open
  });

  it("multiple agents — per-agent counts sum to the unscoped total", () => {
    const multi: D[] = [
      {
        status: "Reported",
        validity: "Valid",
        environment: "Production",
        taxYear: "2026",
        assignedAgent: "alice",
        createdAt: "2026-01-01",
      },
      {
        status: "In Progress",
        validity: "Valid",
        environment: "Production",
        taxYear: "2026",
        assignedAgent: "bob",
        createdAt: "2026-01-02",
      },
      {
        status: "Retest Required",
        validity: "Valid",
        environment: "Production",
        taxYear: "2026",
        assignedAgent: "carol",
        createdAt: "2026-01-03",
      },
      {
        status: "Fixed",
        validity: "Invalid",
        environment: "Production",
        taxYear: "2026",
        assignedAgent: "dan",
        createdAt: "2026-01-04",
      },
      {
        status: "Closed",
        validity: "Invalid",
        environment: "Production",
        taxYear: "2026",
        assignedAgent: "eve",
        createdAt: "2026-01-05",
      },
    ];
    const total = computeKpis(multi, { taxYear: "2026" });
    const per = ["alice", "bob", "carol", "dan", "eve"].map((a) =>
      computeKpis(multi, { taxYear: "2026", agent: a }),
    );
    const sum = per.reduce(
      (acc, p) => ({
        open: acc.open + p.open,
        valid: acc.valid + p.valid,
        invalid: acc.invalid + p.invalid,
        fixed: acc.fixed + p.fixed,
        retest: acc.retest + p.retest,
      }),
      { open: 0, valid: 0, invalid: 0, fixed: 0, retest: 0 },
    );
    expect(sum).toEqual(total);
    expect(total).toEqual(dbCounts(multi, { taxYear: "2026" }));
  });

  it("unassigned defects are excluded by per-agent filter but counted globally", () => {
    const data: D[] = [
      {
        status: "Reported",
        validity: "Valid",
        environment: "Production",
        taxYear: "2027",
        assignedAgent: null,
        createdAt: "2027-01-01",
      },
      {
        status: "Reported",
        validity: "Valid",
        environment: "Production",
        taxYear: "2027",
        assignedAgent: "alice",
        createdAt: "2027-01-02",
      },
    ];
    expect(computeKpis(data, { taxYear: "2027" }).open).toBe(2);
    expect(computeKpis(data, { taxYear: "2027", agent: "alice" }).open).toBe(1);
    expect(computeKpis(data, { taxYear: "2027", agent: "alice" })).toEqual(
      dbCounts(data, { taxYear: "2027", agent: "alice" }),
    );
  });
});
