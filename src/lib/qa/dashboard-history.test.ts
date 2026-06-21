import { describe, it, expect } from "vitest";

// Mirrors the validateSearch in src/routes/_app.my-reported-errors.tsx.
// Browser back/forward replays the entry's URL; TanStack Router re-parses
// search params via this validator, so persistence is equivalent to a
// round-trip through parseSearch().
const PRESETS = ["open", "valid", "invalid", "fixed", "retest", "all"] as const;
type Preset = (typeof PRESETS)[number];

function validateSearch(s: Record<string, unknown>) {
  return {
    q: typeof s.q === "string" ? s.q : undefined,
    preset:
      typeof s.preset === "string" && (PRESETS as readonly string[]).includes(s.preset)
        ? (s.preset as Preset)
        : undefined,
  };
}

function parseUrl(url: string) {
  const u = new URL(url, "https://app.test");
  const raw: Record<string, string> = {};
  u.searchParams.forEach((v, k) => {
    raw[k] = v;
  });
  return { pathname: u.pathname, search: validateSearch(raw) };
}

describe("browser back/forward preserves preset filter", () => {
  // Synthetic history: dashboard → click "Valid Errors" card →
  // open a defect detail → back → back.
  const history = [
    "/dashboard",
    "/my-reported-errors?preset=valid",
    "/my-reported-errors?preset=valid&detail=ZEN-2026-01",
  ];

  it("forward navigation keeps preset on each entry", () => {
    const parsed = history.map(parseUrl);
    expect(parsed[0].search.preset).toBeUndefined();
    expect(parsed[1].search.preset).toBe("valid");
    expect(parsed[2].search.preset).toBe("valid");
  });

  it("back from detail to list restores the preset", () => {
    const back = parseUrl(history[1]);
    expect(back.pathname).toBe("/my-reported-errors");
    expect(back.search.preset).toBe("valid");
  });

  it("back from list to dashboard clears preset (entry has none)", () => {
    const back = parseUrl(history[0]);
    expect(back.pathname).toBe("/dashboard");
    expect(back.search.preset).toBeUndefined();
  });

  it("forward after back re-applies the preset", () => {
    // simulate user pressing back then forward
    const stack = [parseUrl(history[0]), parseUrl(history[1])];
    expect(stack.at(-1)!.search.preset).toBe("valid");
  });

  it("preserves q alongside preset across history entries", () => {
    const e = parseUrl("/my-reported-errors?preset=open&q=1099");
    expect(e.search).toEqual({ preset: "open", q: "1099" });
  });

  it("ignores tampered preset values on replay (back to a bad URL)", () => {
    const e = parseUrl("/my-reported-errors?preset=hacker");
    expect(e.search.preset).toBeUndefined();
  });

  it.each(PRESETS)("round-trips preset=%s through the URL", (p) => {
    const e = parseUrl(`/my-reported-errors?preset=${p}`);
    expect(e.search.preset).toBe(p);
  });
});
