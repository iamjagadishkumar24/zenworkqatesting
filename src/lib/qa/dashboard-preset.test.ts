import { describe, it, expect } from "vitest";

type D = { status: string; validity?: string };

// Mirrors the preset filter in src/routes/_app.my-reported-errors.tsx.
function applyPreset(defects: D[], preset: string | undefined) {
  if (!preset || preset === "all") return defects;
  return defects.filter((d) => {
    switch (preset) {
      case "open":
        return !["Fixed", "Closed"].includes(d.status);
      case "valid":
        return d.validity === "Valid";
      case "invalid":
        return d.validity === "Invalid";
      case "fixed":
        return d.status === "Fixed" || d.status === "Closed";
      case "retest":
        return d.status === "Retest Required";
      default:
        return true;
    }
  });
}

// Mirrors the dashboard stats reducer.
function computeStats(defects: D[]) {
  return {
    total: defects.length,
    open: defects.filter((d) => !["Fixed", "Closed"].includes(d.status)).length,
    valid: defects.filter((d) => d.validity === "Valid").length,
    invalid: defects.filter((d) => d.validity === "Invalid").length,
    fixed: defects.filter((d) => d.status === "Fixed" || d.status === "Closed").length,
    retest: defects.filter((d) => d.status === "Retest Required").length,
  };
}

const sample: D[] = [
  { status: "Reported", validity: "Valid" },
  { status: "Pending", validity: "Unverified" },
  { status: "Ongoing", validity: "Unverified" },
  { status: "In Progress", validity: "Unverified" },
  { status: "Reopened", validity: "Unverified" },
  { status: "Retest Required", validity: "Unverified" },
  { status: "Reported", validity: "Invalid" },
  { status: "Fixed", validity: "Valid" },
  { status: "Closed", validity: "Valid" },
];

describe("dashboard card ↔ filtered preset parity", () => {
  const stats = computeStats(sample);

  it("Total Tests card matches unfiltered count", () => {
    expect(applyPreset(sample, "all").length).toBe(stats.total);
    expect(applyPreset(sample, undefined).length).toBe(stats.total);
  });

  it.each([
    ["open", "open"],
    ["valid", "valid"],
    ["invalid", "invalid"],
    ["fixed", "fixed"],
    ["retest", "retest"],
  ] as const)("%s preset count equals dashboard stat", (preset, key) => {
    expect(applyPreset(sample, preset).length).toBe(stats[key]);
  });

  it("presets are mutually exhaustive for status buckets", () => {
    expect(stats.open + stats.fixed).toBe(stats.total);
  });

  it("status transition Open→Valid moves a record between buckets live", () => {
    const before = computeStats(sample);
    // Promote first Pending (open, Unverified) to Valid.
    const next = sample.map((d, i) => (i === 1 ? { ...d, validity: "Valid" } : d));
    const after = computeStats(next);
    expect(after.valid).toBe(before.valid + 1);
    expect(after.open).toBe(before.open); // still open, just now valid
    expect(applyPreset(next, "valid").length).toBe(after.valid);
  });

  it("status transition Open→Fixed decrements open and increments fixed", () => {
    const before = computeStats(sample);
    const next = sample.map((d, i) => (i === 0 ? { ...d, status: "Fixed" } : d));
    const after = computeStats(next);
    expect(after.open).toBe(before.open - 1);
    expect(after.fixed).toBe(before.fixed + 1);
    expect(applyPreset(next, "open").length).toBe(after.open);
    expect(applyPreset(next, "fixed").length).toBe(after.fixed);
  });

  it("unknown preset falls through to all records (defensive)", () => {
    expect(applyPreset(sample, "bogus").length).toBe(sample.length);
  });
});
