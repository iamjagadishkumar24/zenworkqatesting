import { describe, it, expect } from "vitest";
import { getFirstName } from "./displayName";

describe("getFirstName", () => {
  it("returns the first space-separated token of a full name", () => {
    expect(getFirstName("John Smith")).toBe("John");
    expect(getFirstName("John Q Public")).toBe("John");
  });

  it("keeps hyphenated first names intact", () => {
    expect(getFirstName("Mary-Jane Watson")).toBe("Mary-Jane");
    expect(getFirstName("Jean-Luc Picard")).toBe("Jean-Luc");
  });

  it("collapses multiple/irregular spaces", () => {
    expect(getFirstName("  John   Smith  ")).toBe("John");
    expect(getFirstName("\tJohn\nSmith")).toBe("John");
  });

  it("handles single-word names", () => {
    expect(getFirstName("Cher")).toBe("Cher");
    expect(getFirstName("Madonna  ")).toBe("Madonna");
  });

  it("preserves unicode and apostrophes", () => {
    expect(getFirstName("Renée O'Connor")).toBe("Renée");
    expect(getFirstName("José Álvarez")).toBe("José");
  });

  it("falls back to the email local-part when name is missing/empty", () => {
    expect(getFirstName(null, "alice@example.com")).toBe("alice");
    expect(getFirstName(undefined, "bob@example.com")).toBe("bob");
    expect(getFirstName("", "carol@example.com")).toBe("carol");
    expect(getFirstName("   ", "dave@example.com")).toBe("dave");
  });

  it("returns the generic fallback when name and email are both missing", () => {
    expect(getFirstName()).toBe("Account");
    expect(getFirstName(null, null)).toBe("Account");
    expect(getFirstName("", "")).toBe("Account");
    expect(getFirstName("  ", "   ")).toBe("Account");
  });

  it("honors a custom fallback value", () => {
    expect(getFirstName(null, null, "Guest")).toBe("Guest");
    expect(getFirstName("", "", "Friend")).toBe("Friend");
  });

  it("ignores leading whitespace before the email local-part", () => {
    expect(getFirstName(null, "  zoe@example.com  ")).toBe("zoe");
  });
});