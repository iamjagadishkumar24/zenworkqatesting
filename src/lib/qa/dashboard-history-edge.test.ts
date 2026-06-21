import { describe, it, expect } from "vitest";

// Mirrors validateSearch in src/routes/_app.my-reported-errors.tsx and the
// scrollRestoration flag set on the router in src/router.tsx. Browser
// back/forward replays an entry's full URL, so we exercise the same parser
// the router uses and a tiny synthetic history stack.

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

type Entry = { url: string; scrollY: number };

class FakeHistory {
  stack: Entry[] = [];
  idx = -1;
  push(url: string, scrollY = 0) {
    // truncate forward stack on new push, like real browsers
    this.stack = this.stack.slice(0, this.idx + 1);
    this.stack.push({ url, scrollY });
    this.idx = this.stack.length - 1;
  }
  replace(url: string) {
    this.stack[this.idx] = { ...this.stack[this.idx], url };
  }
  saveScroll(y: number) {
    if (this.idx >= 0) this.stack[this.idx].scrollY = y;
  }
  back() {
    if (this.idx > 0) this.idx -= 1;
    return this.current();
  }
  forward() {
    if (this.idx < this.stack.length - 1) this.idx += 1;
    return this.current();
  }
  current() {
    return this.stack[this.idx];
  }
}

function parse(entry: Entry) {
  const u = new URL(entry.url, "https://app.test");
  const raw: Record<string, string> = {};
  u.searchParams.forEach((v, k) => {
    raw[k] = v;
  });
  return { pathname: u.pathname, search: validateSearch(raw), scrollY: entry.scrollY };
}

describe("rapid card clicks resolve to the last preset", () => {
  it("clicking Open then Valid then Invalid leaves preset=invalid as current entry", () => {
    const h = new FakeHistory();
    h.push("/dashboard");
    // Each card click navigates with `replace: false`; rapid clicks should
    // each create an entry but the visible URL is always the latest.
    h.push("/my-reported-errors?preset=open");
    h.push("/my-reported-errors?preset=valid");
    h.push("/my-reported-errors?preset=invalid");
    expect(parse(h.current()).search.preset).toBe("invalid");
    // back() walks through every preset in reverse insertion order.
    expect(parse(h.back()).search.preset).toBe("valid");
    expect(parse(h.back()).search.preset).toBe("open");
    expect(parse(h.back()).search.preset).toBeUndefined(); // dashboard
    // forward() replays them.
    expect(parse(h.forward()).search.preset).toBe("open");
    expect(parse(h.forward()).search.preset).toBe("valid");
    expect(parse(h.forward()).search.preset).toBe("invalid");
  });
});

describe("scroll restoration across back/forward", () => {
  it("restores per-entry scroll positions on back and forward", () => {
    const h = new FakeHistory();
    h.push("/dashboard");
    h.saveScroll(220);
    h.push("/my-reported-errors?preset=open");
    h.saveScroll(640);
    h.push("/my-reported-errors?preset=open&detail=ZEN-1");
    h.saveScroll(0);

    expect(parse(h.current()).scrollY).toBe(0);
    expect(parse(h.back()).scrollY).toBe(640);
    expect(parse(h.back()).scrollY).toBe(220);
    expect(parse(h.forward()).scrollY).toBe(640);
  });

  it("new navigation resets scroll for the new entry", () => {
    const h = new FakeHistory();
    h.push("/dashboard");
    h.saveScroll(500);
    h.push("/my-reported-errors?preset=valid");
    expect(parse(h.current()).scrollY).toBe(0);
    expect(parse(h.back()).scrollY).toBe(500);
  });
});

describe("preset + search query persist together through history", () => {
  it("typing in the search box after picking a preset keeps both on back/forward", () => {
    const h = new FakeHistory();
    h.push("/dashboard");
    h.push("/my-reported-errors?preset=open");
    // Debounced search-write replaces the current entry rather than pushing.
    h.replace("/my-reported-errors?preset=open&q=1099");
    h.push("/my-reported-errors?preset=open&q=1099&detail=ZEN-2");

    const detail = parse(h.current());
    expect(detail.search).toMatchObject({ preset: "open", q: "1099" });

    const list = parse(h.back());
    expect(list.pathname).toBe("/my-reported-errors");
    expect(list.search).toEqual({ preset: "open", q: "1099" });

    expect(parse(h.back()).pathname).toBe("/dashboard");
    expect(parse(h.forward()).search).toEqual({ preset: "open", q: "1099" });
  });

  it("clearing the search via empty q drops only q and keeps preset", () => {
    const h = new FakeHistory();
    h.push("/my-reported-errors?preset=valid&q=foo");
    h.replace("/my-reported-errors?preset=valid");
    expect(parse(h.current()).search).toEqual({ preset: "valid", q: undefined });
  });
});

describe("chained filters via URL persist across back/forward", () => {
  // Today only preset + q are URL-backed; local UI filters (module, status,
  // priority, agent…) intentionally aren't part of the URL contract. The
  // test pins that contract so a future change is a conscious decision.
  it("preset + q is the full persisted filter contract", () => {
    const e = parse({ url: "/my-reported-errors?preset=open&q=1099&module=Forms", scrollY: 0 });
    expect(e.search).toEqual({ preset: "open", q: "1099" });
    expect((e.search as Record<string, unknown>).module).toBeUndefined();
  });

  it("walking back through a chain of refinements restores each step", () => {
    const h = new FakeHistory();
    h.push("/dashboard");
    h.push("/my-reported-errors?preset=open"); // card click
    h.push("/my-reported-errors?preset=open&q=1099"); // typed query (push, not replace, for this assertion)
    h.push("/my-reported-errors?preset=valid&q=1099"); // switched card without clearing q

    expect(parse(h.current()).search).toEqual({ preset: "valid", q: "1099" });
    expect(parse(h.back()).search).toEqual({ preset: "open", q: "1099" });
    expect(parse(h.back()).search).toEqual({ preset: "open", q: undefined });
    expect(parse(h.back()).search).toEqual({ preset: undefined, q: undefined });
  });
});
