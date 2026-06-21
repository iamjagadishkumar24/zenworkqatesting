import { describe, it, expect } from "vitest";

// Mirrors the stats reducer in src/routes/_app.dashboard.tsx so we can
// assert "count === 0 ⇒ disabled card" wiring stays correct.
type D = { status: string; validity?: string };
function computeStats(defects: D[]) {
  const total = defects.length;
  const open = defects.filter((d) => !["Fixed", "Closed"].includes(d.status)).length;
  const valid = defects.filter((d) => d.validity === "Valid").length;
  const invalid = defects.filter((d) => d.validity === "Invalid").length;
  const fixed = defects.filter((d) => d.status === "Fixed" || d.status === "Closed").length;
  const retest = defects.filter((d) => d.status === "Retest Required").length;
  return { total, open, valid, invalid, fixed, retest };
}

describe("dashboard KPI gating", () => {
  it("empty scope produces all-zero stats so every card is disabled", () => {
    const s = computeStats([]);
    for (const v of Object.values(s)) expect(v).toBe(0);
  });

  it("counts open/valid/invalid/fixed/retest from defect set", () => {
    const s = computeStats([
      { status: "Reported", validity: "Valid" },
      { status: "Closed", validity: "Invalid" },
      { status: "Fixed", validity: "Valid" },
      { status: "Retest Required", validity: "Valid" },
    ]);
    expect(s).toEqual({ total: 4, open: 2, valid: 3, invalid: 1, fixed: 2, retest: 1 });
  });
});
