import { describe, it, expect } from "vitest";
import { FORM_LIST, FORMS_2290 } from "./constants";
import { excludeNonCatalogForms, isTwoTwoNinetyName } from "./scope";

describe("2290 isolation across catalogs", () => {
  it("FORM_LIST (Forms / 1099 Online catalog source) contains no 2290 entries and includes Form 1099 Corrections", () => {
    expect(FORM_LIST.some((n) => /2290/i.test(n))).toBe(false);
    expect(FORM_LIST).toContain("Form 1099 Corrections");
  });

  it("excludeNonCatalogForms strips every 2290 variant and keeps Form 1099 Corrections", () => {
    const noisy = [
      "Form 1099-NEC",
      "Form 2290",
      "EZ2290",
      "2290.us",
      "GT2290",
      "Form 1099 Corrections",
      "Form 990",
    ];
    expect(excludeNonCatalogForms(noisy)).toEqual([
      "Form 1099-NEC",
      "Form 1099 Corrections",
      "Form 990",
    ]);
  });

  it("FORMS_2290 (the dedicated 2290 module) is the only place that surfaces 2290 entries", () => {
    FORMS_2290.forEach((n) => expect(isTwoTwoNinetyName(n)).toBe(true));
    // And those entries must NOT leak into the catalog source.
    FORMS_2290.forEach((n) => expect(FORM_LIST).not.toContain(n));
  });

  it("Catalog rendering inputs (Forms + 1099 Online) hide 2290 even if upstream data regresses", () => {
    const regressed = [...FORM_LIST, "Form 2290", "EZ2290"];
    const visible = excludeNonCatalogForms(regressed);
    expect(visible.some((n) => /2290/i.test(n))).toBe(false);
    expect(visible).toContain("Form 1099 Corrections");
  });
});
