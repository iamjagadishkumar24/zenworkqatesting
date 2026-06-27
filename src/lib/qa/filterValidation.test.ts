import { describe, it, expect } from "vitest";
import { validateFilters, buildEmptyResultMessage, type FilterState } from "./filterValidation";
import type { Defect } from "./types";

function d(over: Partial<Defect> = {}): Defect {
  return {
    id: "ZEN-1",
    module: "1099 Forms",
    formFeature: "Form 1099-NEC",
    title: "x",
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

describe("validateFilters", () => {
  const rows = [d(), d({ id: "ZEN-2", module: "Integrations", assignedAgent: "Bob" })];

  it("warns on Invalid + Fixed/Closed", () => {
    expect(validateFilters({ validity: "Invalid", status: "Fixed" }, rows)[0]).toMatch(
      /Filter conflict/,
    );
    expect(validateFilters({ validity: "Invalid", status: "Closed" }, rows)[0]).toMatch(/Closed/);
  });

  it("warns on Valid + Reported", () => {
    expect(validateFilters({ validity: "Valid", status: "Reported" }, rows)[0]).toMatch(/Valid/);
  });

  it("warns when quick=open conflicts with terminal status", () => {
    expect(validateFilters({ quick: "open", status: "Fixed" }, rows)[0]).toMatch(/Open/);
    expect(validateFilters({ quick: "open", status: "Closed" }, rows)[0]).toMatch(/Closed/);
  });

  it("warns when agent has no defects in the chosen module", () => {
    const w = validateFilters({ assignedAgent: "Bob", module: "1099 Forms" }, rows);
    expect(w[0]).toMatch(/Bob is not assigned/);
  });

  it("no warning when agent has matching defects", () => {
    expect(validateFilters({ assignedAgent: "Alice", module: "1099 Forms" }, rows)).toEqual([]);
  });

  it("ignores 'all' sentinels", () => {
    expect(validateFilters({ assignedAgent: "all", module: "all" }, rows)).toEqual([]);
  });
});

describe("buildEmptyResultMessage", () => {
  const rows: Defect[] = [];

  it("returns generic message when no filters and no warnings", () => {
    expect(buildEmptyResultMessage({}, [])).toBe("No defects available yet.");
  });

  it("returns warning text when warnings exist", () => {
    const w = ["A.", "B."];
    expect(
      buildEmptyResultMessage({ validity: "Invalid", status: "Fixed" } as FilterState, w),
    ).toBe("A. B.");
  });

  it("lists active filter keys when no warnings", () => {
    const msg = buildEmptyResultMessage({ q: "foo", module: "1099 Forms", status: "all" }, []);
    expect(msg).toMatch(/q, module/);
    expect(msg).toMatch(/resetting/);
  });

  it("ignores empty-string and 'all' values when listing active filters", () => {
    const msg = buildEmptyResultMessage({ q: "", status: "all", priority: "High" }, []);
    expect(msg).toMatch(/priority/);
    expect(msg).not.toMatch(/status/);
    expect(msg).not.toMatch(/\bq\b/);
  });
});
