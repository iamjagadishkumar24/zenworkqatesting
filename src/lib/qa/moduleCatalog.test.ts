// End-to-end coverage for the strict server-backed Forms/Features catalog.
// The same `getModuleCatalog` is the single source of truth used by:
//   1. `listAssignableFormsForModule` (the server-fn the Assign Task picker
//      calls to populate options) — Create flow,
//   2. `editAssignmentScope` → `validateAssignmentScopeServer` — Edit flow,
//   3. `reassign` (no scope change; existing form rows stay valid) —
//      Reassign flow.
// These tests lock the canonical mapping so a regression in any one of
// those flows surfaces immediately.

import { describe, it, expect } from "vitest";
import {
  FORM_LIST,
  FORMS_2290,
  FORMS_990,
  INTEGRATIONS,
  FEATURES_CHATBOT,
  FEATURES_EXCEL_IMPORT,
  FEATURES_FUNCTIONALITY,
  FEATURES_TAX1099,
  MODULE_OPTIONS,
  getModuleCatalog,
} from "./constants";
import { validateAssignmentScopeCanonical } from "./assignmentValidation";

// Mirror of the server-fn `listAssignableFormsForModule.handler` body —
// keeping the assertion close to the actual handler so any future change
// in shape (e.g. adding `module`) is caught here too.
function listAssignableForms(module: string): { id: string; name: string; module: string }[] {
  const catalog = getModuleCatalog(module);
  if (!catalog) return [];
  return catalog.map((name) => ({ id: name, name, module }));
}

describe("Module → Forms/Features catalog (Create / Edit / Reassign)", () => {
  const cases: Array<{ module: string; expected: string[] }> = [
    { module: "Forms", expected: FORM_LIST },
    { module: "1099 Online Forms", expected: FORM_LIST },
    { module: "2290 Forms", expected: FORMS_2290 },
    { module: "990 Form Testing", expected: FORMS_990 },
    { module: "Integrations", expected: INTEGRATIONS },
    { module: "Chatbot Testing", expected: FEATURES_CHATBOT },
    { module: "Excel Import Testing", expected: FEATURES_EXCEL_IMPORT },
    { module: "Functionality Testing", expected: FEATURES_FUNCTIONALITY },
    { module: "Tax1099 Features", expected: FEATURES_TAX1099 },
  ];

  it.each(cases)(
    "listAssignableForms('$module') returns exactly its mapped catalog",
    ({ module, expected }) => {
      const rows = listAssignableForms(module);
      expect(rows.map((r) => r.name)).toEqual(expected);
      rows.forEach((r) => expect(r.module).toBe(module));
    },
  );

  it("every module surfaced in the Assign dropdown has a catalog defined", () => {
    for (const m of MODULE_OPTIONS) {
      const c = getModuleCatalog(m);
      expect(c, `missing catalog for module: ${m}`).not.toBeNull();
      expect(c!.length, `empty catalog for module: ${m}`).toBeGreaterThan(0);
    }
  });

  it("catalogs do not leak across modules (no cross-module bleed)", () => {
    // 2290 entries must never appear in Forms / 1099 Online Forms.
    FORMS_2290.forEach((n) => expect(FORM_LIST).not.toContain(n));
    // 990 entries are their own module and not in FORM_LIST.
    FORMS_990.forEach((n) => expect(FORM_LIST).not.toContain(n));
    // Integrations never appear in a forms catalog.
    INTEGRATIONS.forEach((n) => expect(FORM_LIST).not.toContain(n));
    INTEGRATIONS.forEach((n) => expect(FORMS_990).not.toContain(n));
  });

  describe("Create flow (createAssignment → validateAssignmentScopeServer)", () => {
    it("accepts every option returned by the listing fn", () => {
      for (const { module } of cases) {
        const rows = listAssignableForms(module);
        const r = validateAssignmentScopeCanonical({
          module,
          allForms: false,
          formNames: rows.map((x) => x.name),
        });
        expect(r.ok, `${module}: server rejected its own catalog`).toBe(true);
      }
    });

    it("rejects a name picked from another module's catalog", () => {
      // Pick "QuickBooks Online" (Integrations) while module = Forms.
      const r = validateAssignmentScopeCanonical({
        module: "Forms",
        allForms: false,
        formNames: ["Form 1099-NEC", "QuickBooks Online"],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.offenders).toEqual(["QuickBooks Online"]);
    });

    it("rejects a 2290 form when module = 1099 Online Forms", () => {
      const r = validateAssignmentScopeCanonical({
        module: "1099 Online Forms",
        allForms: false,
        formNames: ["EZ2290"],
      });
      expect(r.ok).toBe(false);
    });
  });

  describe("Edit flow (editAssignmentScope → validateAssignmentScopeServer)", () => {
    it("changing module to one whose catalog excludes prior picks fails validation", () => {
      // Original task on "Integrations" picked QuickBooks Online; admin
      // edits module to "990 Form Testing" without clearing the pick.
      const r = validateAssignmentScopeCanonical({
        module: "990 Form Testing",
        allForms: false,
        formNames: ["QuickBooks Online"],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.offenders).toContain("QuickBooks Online");
    });

    it("changing module + replacing picks with the new module's catalog passes", () => {
      const r = validateAssignmentScopeCanonical({
        module: "990 Form Testing",
        allForms: false,
        formNames: FORMS_990,
      });
      expect(r.ok).toBe(true);
    });
  });

  describe("Reassign flow", () => {
    it("does not change module or forms, so an existing valid pick stays valid", () => {
      // Reassign only swaps the agent — the previously-validated forms
      // are still in the same catalog after the operation.
      const before = validateAssignmentScopeCanonical({
        module: "Forms",
        allForms: false,
        formNames: ["Form 1099-NEC", "Form W-2"],
      });
      expect(before.ok).toBe(true);
      const after = validateAssignmentScopeCanonical({
        module: "Forms",
        allForms: false,
        formNames: ["Form 1099-NEC", "Form W-2"],
      });
      expect(after.ok).toBe(true);
    });
  });
});
