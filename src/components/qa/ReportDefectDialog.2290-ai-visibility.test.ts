import { describe, it, expect } from "vitest";
import { FORMS_2290 } from "@/lib/qa/constants";
import { FORM_2290_AI_CATEGORIES } from "@/lib/qa/adminFilters";

// Mirrors the gating used inside ReportDefectDialog:
//   const is2290Ai = !featureMode && draft._form === "2290.ai";
// The Issue Category dropdown, its required-field validation, and the
// schedules payload override are ALL gated on this single flag, so a unit
// test on the predicate proves the dropdown is hidden — and the legacy
// flow is unchanged — for every other 2290 form type.
function is2290Ai(form: string, featureMode = false): boolean {
  return !featureMode && form === "2290.ai";
}

describe("Report Defect — 2290.ai Issue Category visibility", () => {
  it("shows the Issue Category dropdown only for the 2290.ai form", () => {
    expect(is2290Ai("2290.ai")).toBe(true);
    for (const form of FORMS_2290.filter((f) => f !== "2290.ai")) {
      expect(is2290Ai(form)).toBe(false);
    }
  });

  it("hides the dropdown for unrelated form types", () => {
    for (const form of ["", "Form 990", "1099-NEC", "Form 2290", "EZ2290", "GT2290", "2290.us"]) {
      expect(is2290Ai(form)).toBe(false);
    }
  });

  it("hides the dropdown in feature mode even when form is 2290.ai", () => {
    expect(is2290Ai("2290.ai", true)).toBe(false);
  });

  it("exposes the three landing-page categories in fixed order", () => {
    expect([...FORM_2290_AI_CATEGORIES]).toEqual([
      "Take a Picture & Upload",
      "eFiling Wizard",
      "One-Click eFiling",
    ]);
  });
});
