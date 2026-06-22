import { describe, it, expect } from "vitest";
import {
  AGENTS,
  DEFAULT_TAX_YEAR,
  FF_SEP,
  FORM_LIST,
  FORMS_990,
  FORMS_2290,
  INTEGRATIONS,
  MODULE_OPTIONS,
  TAX_YEARS,
  decodeFormFeature,
  encodeFormFeature,
  getModuleCatalog,
  isFormsModule,
  isOnline1099Module,
  routeForModule,
  usesFullFormsCatalog,
} from "./constants";

describe("constants: formFeature codec", () => {
  it("encodes form only when integration missing", () => {
    expect(encodeFormFeature("Form 1099-NEC")).toBe("Form 1099-NEC");
    expect(encodeFormFeature("Form 1099-NEC", "")).toBe("Form 1099-NEC");
  });
  it("joins form and integration with the canonical separator", () => {
    const s = encodeFormFeature("Form 1099-NEC", "QuickBooks Online");
    expect(s).toBe(`Form 1099-NEC${FF_SEP}QuickBooks Online`);
  });
  it("trims whitespace from both sides", () => {
    expect(encodeFormFeature("  A  ", "  B  ")).toBe(`A${FF_SEP}B`);
  });
  it("decodes blank/null safely", () => {
    expect(decodeFormFeature(null)).toEqual({ form: "", integration: "" });
    expect(decodeFormFeature(undefined)).toEqual({ form: "", integration: "" });
    expect(decodeFormFeature("")).toEqual({ form: "", integration: "" });
  });
  it("decodes form-only and form+integration round trips", () => {
    expect(decodeFormFeature("Form 1099-NEC")).toEqual({
      form: "Form 1099-NEC",
      integration: "",
    });
    expect(decodeFormFeature(encodeFormFeature("Form 1099-NEC", "Xero"))).toEqual({
      form: "Form 1099-NEC",
      integration: "Xero",
    });
  });
});

describe("constants: module helpers", () => {
  it("isFormsModule recognises canonical + legacy values", () => {
    expect(isFormsModule("Forms")).toBe(true);
    expect(isFormsModule("1099 Forms")).toBe(true);
    expect(isFormsModule("990 Forms")).toBe(true);
    expect(isFormsModule("Integrations")).toBe(false);
    expect(isFormsModule(null)).toBe(false);
    expect(isFormsModule(undefined)).toBe(false);
  });
  it("isOnline1099Module recognises canonical + legacy values", () => {
    expect(isOnline1099Module("1099 Online Forms")).toBe(true);
    expect(isOnline1099Module("1099 Online")).toBe(true);
    expect(isOnline1099Module("Forms")).toBe(false);
    expect(isOnline1099Module(null)).toBe(false);
  });
  it("usesFullFormsCatalog returns true for forms + 1099 online buckets", () => {
    expect(usesFullFormsCatalog("Forms")).toBe(true);
    expect(usesFullFormsCatalog("1099 Online Forms")).toBe(true);
    expect(usesFullFormsCatalog("Integrations")).toBe(false);
  });
});

describe("constants: getModuleCatalog dispatches per module", () => {
  it("returns FORM_LIST for forms and 1099 online", () => {
    expect(getModuleCatalog("Forms")).toEqual(FORM_LIST);
    expect(getModuleCatalog("1099 Online Forms")).toEqual(FORM_LIST);
    // returns a fresh copy each call
    const a = getModuleCatalog("Forms")!;
    expect(a).not.toBe(FORM_LIST);
  });
  it("returns dedicated catalogs for 990 and 2290", () => {
    expect(getModuleCatalog("990 Form Testing")).toEqual(FORMS_990);
    expect(getModuleCatalog("990 Forms")).toEqual(FORMS_990);
    expect(getModuleCatalog("2290 Forms")).toEqual(FORMS_2290);
  });
  it("returns INTEGRATIONS for integrations module", () => {
    expect(getModuleCatalog("Integrations")).toEqual(INTEGRATIONS);
  });
  it("returns null for unknown or missing modules", () => {
    expect(getModuleCatalog(null)).toBeNull();
    expect(getModuleCatalog(undefined)).toBeNull();
    expect(getModuleCatalog("Mystery Module")).toBeNull();
  });
  it("returns curated feature lists for chatbot, excel, functionality, tax1099, payments", () => {
    expect(getModuleCatalog("Chatbot Testing")?.length).toBeGreaterThan(0);
    expect(getModuleCatalog("Excel Import Testing")?.length).toBeGreaterThan(0);
    expect(getModuleCatalog("Functionality Testing")?.length).toBeGreaterThan(0);
    expect(getModuleCatalog("Tax1099 Features")?.length).toBeGreaterThan(0);
    expect(getModuleCatalog("Zenwork Payments")?.length).toBeGreaterThan(0);
  });
});

describe("constants: routeForModule", () => {
  it("routes known modules to their canonical path", () => {
    expect(routeForModule("Forms")).toBe("/forms");
    expect(routeForModule("1099 Online Forms")).toBe("/online-1099");
    expect(routeForModule("Integrations")).toBe("/integrations");
    expect(routeForModule("Zenwork Payments")).toBe("/zenwork-payments");
  });
  it("falls back to /retest for null/unknown modules", () => {
    expect(routeForModule(null)).toBe("/retest");
    expect(routeForModule(undefined)).toBe("/retest");
    expect(routeForModule("Nope")).toBe("/retest");
  });
});

describe("constants: agents and tax years", () => {
  it("AGENTS list is deduplicated and alphabetically sorted", () => {
    expect(new Set(AGENTS).size).toBe(AGENTS.length);
    const sorted = [...AGENTS].sort((a, b) => a.localeCompare(b));
    expect(AGENTS).toEqual(sorted);
  });
  it("DEFAULT_TAX_YEAR is one of TAX_YEARS", () => {
    expect(TAX_YEARS).toContain(DEFAULT_TAX_YEAR);
  });
  it("MODULE_OPTIONS exposes the canonical Forms + 1099 Online entries", () => {
    expect(MODULE_OPTIONS).toContain("Forms");
    expect(MODULE_OPTIONS).toContain("1099 Online Forms");
  });
});