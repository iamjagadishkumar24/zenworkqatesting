import { describe, it, expect } from "vitest";
import type { Defect } from "./types";
import {
  REPORTED_ERROR_HEADERS,
  toReportedErrorRow,
  buildReportedErrorsFilename,
} from "./exportReportedErrors";
import { filterByEnvironment } from "./scope";
import { matchesTaxYear } from "./taxYear";

function makeDefect(over: Partial<Defect> = {}): Defect {
  return {
    id: "ZEN-2026-01",
    module: "1099 Forms",
    formFeature: "Form 1099-MISC",
    taxYear: "2026",
    title: "Boom",
    description: "It exploded",
    stepsToReproduce: "1. click",
    expectedResult: "no boom",
    actualResult: "boom",
    status: "Reported",
    priority: "High",
    severity: "High",
    validity: "Unverified",
    environment: "Production",
    assignedAgent: "Bob",
    createdAt: "2026-02-03T10:00:00.000Z",
    updatedAt: "2026-02-03T10:00:00.000Z",
    updatedBy: "Alice",
    createdBy: "Alice",
    comments: [],
    ...over,
  };
}

describe("Reported-error export — columns", () => {
  it("headers list matches contract (Date Reported, Agent Name, Form, …)", () => {
    expect(REPORTED_ERROR_HEADERS).toEqual([
      "Date Reported",
      "Agent Name",
      "Form",
      "Error Description",
      "Expected Result / Outcome",
      "Priority",
      "Screenshots / Recordings Link",
      "General Link",
      "Jira Link",
      "Additional Comments",
      "Admin Review Status",
      "Retest Status",
      "Retest Comments",
      "Retest Updated Date",
    ]);
  });

  it("Form column contains only the form name (no module prefix)", () => {
    const row = toReportedErrorRow(makeDefect());
    expect(row.section).toBe("Form 1099-MISC");
    expect(row.section).not.toMatch(/1099 Forms/);
    expect(row.section).not.toMatch(/\//);
  });

  it("falls back to empty string when no form is set", () => {
    const row = toReportedErrorRow(makeDefect({ formFeature: "" }));
    expect(row.section).toBe("");
  });

  it("admin review label reflects validity + status correctly", () => {
    expect(toReportedErrorRow(makeDefect({ validity: "Invalid" })).adminReview).toBe(
      "Invalid Error",
    );
    expect(
      toReportedErrorRow(makeDefect({ validity: "Valid", status: "Pending" })).adminReview,
    ).toBe("Valid Error");
    expect(toReportedErrorRow(makeDefect({ status: "Retest Required" })).adminReview).toBe(
      "Retest Required",
    );
    expect(toReportedErrorRow(makeDefect({ status: "Fixed" })).adminReview).toBe("Fixed");
  });

  it("filename embeds environment and ISO date", () => {
    const name = buildReportedErrorsFilename("Production", new Date("2026-03-04T12:00:00Z"));
    expect(name).toMatch(/^Zenwork_Error_Report_Production_2026-03-04\.xlsx$/);
  });
});

describe("Reported-error export — filters & totals before export", () => {
  const data: Defect[] = [
    makeDefect({ id: "a", environment: "Production", taxYear: "2026" }),
    makeDefect({ id: "b", environment: "Stage", taxYear: "2026" }),
    makeDefect({ id: "c", environment: "Production", taxYear: "2025" }),
  ];

  it("environment filter drops Stage rows when env=Production", () => {
    const filtered = filterByEnvironment(data, "Production");
    expect(filtered.map((d) => d.id)).toEqual(["a", "c"]);
  });

  it("tax-year filter is exact-match (string)", () => {
    const filtered = data.filter((d) => matchesTaxYear(d.taxYear, "2026"));
    expect(filtered.map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("row count equals input length after toReportedErrorRow mapping", () => {
    const rows = data.map((d) => toReportedErrorRow(d));
    expect(rows).toHaveLength(data.length);
  });
});
