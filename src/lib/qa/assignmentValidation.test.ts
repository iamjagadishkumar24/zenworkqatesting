import { describe, it, expect } from "vitest";
import {
  validateAssignmentScope,
  validateAssignmentScopeCanonical,
  validateTestingTypeMatchesModule,
} from "./assignmentValidation";

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

describe("validateTestingTypeMatchesModule", () => {
  it("allows freeform Retest with any module", () => {
    expect(validateTestingTypeMatchesModule("Forms", "Retest").ok).toBe(true);
    expect(validateTestingTypeMatchesModule("Integrations", "Retest").ok).toBe(true);
  });

  it("matches Forms ↔ Forms (and legacy aliases)", () => {
    expect(validateTestingTypeMatchesModule("Forms", "Forms").ok).toBe(true);
    expect(validateTestingTypeMatchesModule("1099 Forms", "Forms").ok).toBe(true);
  });

  it("matches 1099 Online Forms ↔ 1099 Online Forms (and legacy alias)", () => {
    expect(validateTestingTypeMatchesModule("1099 Online Forms", "1099 Online Forms").ok).toBe(true);
    expect(validateTestingTypeMatchesModule("1099 Online", "1099 Online Forms").ok).toBe(true);
  });

  it("rejects testing-type / module mismatch", () => {
    const r = validateTestingTypeMatchesModule("Forms", "Integrations");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Integrations");
  });

  it("rejects scoped testing type when module is All Modules", () => {
    const r = validateTestingTypeMatchesModule("All Modules", "Forms");
    expect(r.ok).toBe(false);
  });
});

describe("validateAssignmentScopeCanonical (server-side guard)", () => {
  it("accepts canonical FORM_LIST entries for Forms", () => {
    const r = validateAssignmentScopeCanonical({
      module: "Forms",
      testingType: "Forms",
      allForms: false,
      formNames: ["Form 1099-NEC", "Form 1099 Corrections", "Form W-2"],
    });
    expect(r.ok).toBe(true);
  });

  it("accepts canonical FORM_LIST entries for 1099 Online Forms", () => {
    const r = validateAssignmentScopeCanonical({
      module: "1099 Online Forms",
      testingType: "1099 Online Forms",
      allForms: false,
      formNames: ["Form 1099-NEC"],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects names not in the canonical catalog for Forms", () => {
    const r = validateAssignmentScopeCanonical({
      module: "Forms",
      testingType: "Forms",
      allForms: false,
      formNames: ["Form 1099-NEC", "EZ2290", "QuickBooks Integration"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.offenders).toEqual(["EZ2290", "QuickBooks Integration"]);
    }
  });

  it("rejects testing type / module mismatch before checking forms", () => {
    const r = validateAssignmentScopeCanonical({
      module: "Forms",
      testingType: "Integrations",
      allForms: false,
      formNames: ["Form 1099-NEC"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Integrations");
  });

  it("allForms bypasses the catalog check", () => {
    const r = validateAssignmentScopeCanonical({
      module: "Forms",
      testingType: "Forms",
      allForms: true,
      formNames: ["whatever"],
    });
    expect(r.ok).toBe(true);
  });

  it("non-catalog modules (Integrations) accept any feature name", () => {
    const r = validateAssignmentScopeCanonical({
      module: "Integrations",
      testingType: "Integrations",
      allForms: false,
      formNames: ["QuickBooks", "Xero", "Bill"],
    });
    expect(r.ok).toBe(true);
  });
});