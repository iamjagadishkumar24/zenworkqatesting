import { describe, it, expect } from "vitest";
import { validateAssignmentScope } from "./assignmentValidation";

const qb = { id: "qb", name: "QuickBooks Integration", module: "Integrations" };
const xero = { id: "xero", name: "Xero Integration", module: "Integrations" };
const form1099 = { id: "1099nec", name: "Form 1099-NEC", module: "Forms" };

describe("validateAssignmentScope", () => {
  it("allows picks that all belong to the scope", () => {
    const r = validateAssignmentScope({
      module: "Integrations",
      allForms: false,
      pickedIds: ["qb", "xero"],
      availableForms: [qb, xero],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects forms outside the integration scope", () => {
    const r = validateAssignmentScope({
      module: "Integrations",
      allForms: false,
      pickedIds: ["qb", "1099nec"],
      availableForms: [qb, xero],
      allForms_catalog: [qb, xero, form1099],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.offenders).toEqual(["Form 1099-NEC"]);
      expect(r.error).toContain("Integrations");
      expect(r.error).toContain("Form 1099-NEC");
    }
  });

  it("skips validation when allForms is true", () => {
    const r = validateAssignmentScope({
      module: "Integrations",
      allForms: true,
      pickedIds: ["1099nec"],
      availableForms: [qb],
    });
    expect(r.ok).toBe(true);
  });

  it("passes when nothing is picked", () => {
    const r = validateAssignmentScope({
      module: "Forms",
      allForms: false,
      pickedIds: [],
      availableForms: [form1099],
    });
    expect(r.ok).toBe(true);
  });

  it("truncates the offender preview at three names", () => {
    const extras = Array.from({ length: 5 }, (_, i) => ({
      id: `x${i}`,
      name: `Form X${i}`,
      module: "Forms",
    }));
    const r = validateAssignmentScope({
      module: "Integrations",
      allForms: false,
      pickedIds: extras.map((e) => e.id),
      availableForms: [qb],
      allForms_catalog: [qb, ...extras],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("+2 more");
  });
});