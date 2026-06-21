import { describe, it, expect } from "vitest";
import type { Defect, DefectStatus } from "./types";

// ---------------------------------------------------------------------------
// Pure reducer mirroring server-side defect mutations. The real flow goes
// through Supabase + RLS + triggers; this reducer exercises the SAME field
// transitions the UI relies on so dashboard counts and audit fields stay
// honest in unit tests.
// ---------------------------------------------------------------------------

type DefectWithVersion = Defect & { version: number };

function makeDefect(over: Partial<DefectWithVersion> = {}): DefectWithVersion {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "ZEN-2026-01",
    module: "1099 Forms",
    formFeature: "Form 1099-NEC",
    title: "Sample",
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
    createdAt: now,
    updatedAt: now,
    updatedBy: "Alice",
    createdBy: "Alice",
    comments: [],
    version: 1,
    ...over,
  };
}

function applyPatch(
  d: DefectWithVersion,
  patch: Partial<Defect>,
  actor: string,
  at = "2026-01-02T00:00:00.000Z",
): DefectWithVersion {
  return {
    ...d,
    ...patch,
    updatedBy: actor,
    updatedAt: at,
    version: d.version + 1,
  };
}

// Mirrors src/routes/_app.dashboard.tsx stats computation.
function counts(defects: DefectWithVersion[]) {
  return {
    total: defects.length,
    open: defects.filter((d) => !["Fixed", "Closed"].includes(d.status)).length,
    valid: defects.filter((d) => d.validity === "Valid").length,
    invalid: defects.filter((d) => d.validity === "Invalid").length,
    fixed: defects.filter((d) => d.status === "Fixed" || d.status === "Closed").length,
    retest: defects.filter((d) => d.status === "Retest Required").length,
  };
}

describe("Defect workflow — state transitions", () => {
  const happyPath: DefectStatus[] = [
    "Reported",
    "Pending",
    "Ongoing",
    "In Progress",
    "Fixed",
    "Closed",
  ];

  it("walks the happy path Reported → Closed bumping version + updatedBy", () => {
    let d = makeDefect();
    for (let i = 1; i < happyPath.length; i++) {
      const next = happyPath[i];
      const beforeVersion = d.version;
      d = applyPatch(d, { status: next }, i % 2 === 0 ? "Admin" : "Alice");
      expect(d.status).toBe(next);
      expect(d.version).toBe(beforeVersion + 1);
      expect(d.updatedBy.length).toBeGreaterThan(0);
    }
    expect(d.status).toBe("Closed");
  });

  it("retest cycle: Fixed → Retest Required → Reopened → Fixed", () => {
    let d = makeDefect({ status: "Fixed" });
    d = applyPatch(d, { status: "Retest Required" }, "Admin");
    expect(d.status).toBe("Retest Required");
    d = applyPatch(d, { status: "Reopened" }, "Alice");
    expect(d.status).toBe("Reopened");
    d = applyPatch(d, { status: "Fixed" }, "Admin");
    expect(d.status).toBe("Fixed");
    expect(d.version).toBe(4);
  });

  it("validity flips track audit author independently of status", () => {
    let d = makeDefect();
    d = applyPatch(d, { validity: "Valid" }, "Admin");
    expect(d.validity).toBe("Valid");
    expect(d.updatedBy).toBe("Admin");
    d = applyPatch(d, { validity: "Invalid", status: "Closed" }, "Admin");
    expect(d.validity).toBe("Invalid");
    expect(d.status).toBe("Closed");
  });

  it("assignedAgent reassignment preserves identity fields and bumps version", () => {
    let d = makeDefect({ assignedAgent: "Alice" });
    d = applyPatch(d, { assignedAgent: "Bob" }, "Admin");
    expect(d.assignedAgent).toBe("Bob");
    expect(d.createdBy).toBe("Alice"); // never mutated
    expect(d.version).toBe(2);
  });
});

describe("Defect workflow — dashboard counts react to status changes", () => {
  it("Reported defect counts as open + total only", () => {
    expect(counts([makeDefect()])).toEqual({
      total: 1,
      open: 1,
      valid: 0,
      invalid: 0,
      fixed: 0,
      retest: 0,
    });
  });
  it("Marking Fixed flips open→fixed", () => {
    let d = makeDefect();
    d = applyPatch(d, { status: "Fixed" }, "Admin");
    expect(counts([d])).toEqual({
      total: 1,
      open: 0,
      valid: 0,
      invalid: 0,
      fixed: 1,
      retest: 0,
    });
  });
  it("Validity Valid is counted regardless of open/fixed", () => {
    const a = makeDefect({ id: "a", validity: "Valid" });
    const b = applyPatch(makeDefect({ id: "b", validity: "Valid" }), { status: "Fixed" }, "x");
    expect(counts([a, b])).toMatchObject({ total: 2, valid: 2, fixed: 1, open: 1 });
  });
  it("Retest Required adds to retest and still counts as open", () => {
    const d = applyPatch(makeDefect(), { status: "Retest Required" }, "Admin");
    expect(counts([d])).toMatchObject({ retest: 1, open: 1, fixed: 0 });
  });
});
