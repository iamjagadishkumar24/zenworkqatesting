import { describe, it, expect } from "vitest";
import { encodeRetestTitle, extractDefectId, stripDefectTag, isRetestForDefect } from "./retestLink";

describe("retestLink", () => {
  it("encodes a defect tag into the title", () => {
    expect(encodeRetestTitle("ZEN-2026-01", "Form NEC fails")).toBe("[DEF:ZEN-2026-01] Form NEC fails");
  });

  it("caps the encoded title at 240 characters", () => {
    const long = "x".repeat(500);
    const out = encodeRetestTitle("ZEN-1", long);
    expect(out.length).toBe(240);
    expect(out.startsWith("[DEF:ZEN-1] ")).toBe(true);
  });

  it("extracts the defect id when present", () => {
    expect(extractDefectId("[DEF:ZEN-2026-01] body")).toBe("ZEN-2026-01");
  });

  it("returns null for missing/blank/non-tagged titles", () => {
    expect(extractDefectId(null)).toBeNull();
    expect(extractDefectId(undefined)).toBeNull();
    expect(extractDefectId("")).toBeNull();
    expect(extractDefectId("no tag here")).toBeNull();
    expect(extractDefectId("not [DEF:ZEN-1] at start")).toBeNull();
  });

  it("strips the tag and leaves a clean title", () => {
    expect(stripDefectTag("[DEF:ZEN-1] hello world")).toBe("hello world");
    expect(stripDefectTag("no tag")).toBe("no tag");
    expect(stripDefectTag(null)).toBe("");
    expect(stripDefectTag(undefined)).toBe("");
  });

  it("isRetestForDefect mirrors extractDefectId truthiness", () => {
    expect(isRetestForDefect("[DEF:X] y")).toBe(true);
    expect(isRetestForDefect("plain")).toBe(false);
    expect(isRetestForDefect(null)).toBe(false);
  });

  it("roundtrips through encode → extract → strip", () => {
    const t = encodeRetestTitle("ZEN-9", "Hello");
    expect(extractDefectId(t)).toBe("ZEN-9");
    expect(stripDefectTag(t)).toBe("Hello");
  });
});