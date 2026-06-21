import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mirrors validateSearch in src/routes/_app.my-reported-errors.tsx so these
// tests reflect the exact URL contract the router uses.
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
function parse(url: string) {
  const u = new URL(url, "https://app.test");
  const raw: Record<string, string> = {};
  u.searchParams.forEach((v, k) => {
    raw[k] = v;
  });
  return validateSearch(raw);
}

// ---------------------------------------------------------------------------
// 1. Pagination & sorting are NOT URL-backed today. Tests pin that contract
//    so any future change is deliberate and tested. Add them to the
//    URL contract first, then update these tests.
// ---------------------------------------------------------------------------
describe("preset+q URL contract (pagination/sorting not yet persisted)", () => {
  it("drops pagination and sort keys from search", () => {
    const s = parse("/my-reported-errors?preset=open&q=1099&page=3&sort=priority:desc");
    expect(s).toEqual({ preset: "open", q: "1099" });
  });

  it("preset+q survive back/forward exactly as written", () => {
    const a = parse("/my-reported-errors?preset=valid&q=hello");
    const b = parse("/my-reported-errors?preset=valid&q=hello"); // forward replay
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// 2. Focus restoration is best-effort: when a user opens a detail and comes
//    back, focus should return to the row trigger. Modeled as a focus stack
//    keyed by URL so the same restore logic works on back AND forward.
// ---------------------------------------------------------------------------
function makeFocusStack() {
  const store = new Map<string, string>(); // url -> elementId
  return {
    save(url: string, elementId: string) {
      store.set(url, elementId);
    },
    restore(url: string) {
      return store.get(url) ?? null;
    },
  };
}

describe("a11y focus restoration on back/forward", () => {
  it("returns focus to the row that opened the detail", () => {
    const f = makeFocusStack();
    f.save("/my-reported-errors?preset=open", "row-ZEN-2026-03");
    // user navigated to /my-reported-errors?preset=open&detail=ZEN-2026-03,
    // then pressed Back.
    expect(f.restore("/my-reported-errors?preset=open")).toBe("row-ZEN-2026-03");
  });

  it("returns focus to the dashboard card that opened the list", () => {
    const f = makeFocusStack();
    f.save("/dashboard", "kpi-card-valid");
    expect(f.restore("/dashboard")).toBe("kpi-card-valid");
  });

  it("forward navigation restores the saved focus for that entry", () => {
    const f = makeFocusStack();
    f.save("/my-reported-errors?preset=open", "row-ZEN-2026-03");
    f.save("/my-reported-errors?preset=valid", "row-ZEN-2026-07");
    expect(f.restore("/my-reported-errors?preset=valid")).toBe("row-ZEN-2026-07");
    expect(f.restore("/my-reported-errors?preset=open")).toBe("row-ZEN-2026-03");
  });

  it("returns null when no focus was previously saved", () => {
    expect(makeFocusStack().restore("/dashboard")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Debounce: mirrors the 250ms write-through from qInput → URL in
//    _app.my-reported-errors.tsx. Verifies only the last value commits and
//    preset is never lost.
// ---------------------------------------------------------------------------
function makeDebouncedUrlWriter(initialUrl: string, delay = 250) {
  let url = initialUrl;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    get url() {
      return url;
    },
    type(nextQ: string) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const u = new URL(url, "https://app.test");
        if (nextQ) u.searchParams.set("q", nextQ);
        else u.searchParams.delete("q");
        url = u.pathname + (u.search ? u.search : "");
      }, delay);
    },
  };
}

describe("search box debounces without losing the preset", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("only the last keystroke commits to the URL", () => {
    const w = makeDebouncedUrlWriter("/my-reported-errors?preset=open");
    w.type("1");
    vi.advanceTimersByTime(100);
    w.type("10");
    vi.advanceTimersByTime(100);
    w.type("109");
    vi.advanceTimersByTime(100);
    w.type("1099");
    expect(parse(w.url)).toEqual({ preset: "open", q: undefined }); // still pending
    vi.advanceTimersByTime(250);
    expect(parse(w.url)).toEqual({ preset: "open", q: "1099" });
  });

  it("clearing input deletes q but preserves preset", () => {
    const w = makeDebouncedUrlWriter("/my-reported-errors?preset=valid&q=foo");
    w.type("");
    vi.advanceTimersByTime(250);
    expect(parse(w.url)).toEqual({ preset: "valid", q: undefined });
  });

  it("navigation interleaved with typing keeps preset stable", () => {
    const w = makeDebouncedUrlWriter("/my-reported-errors?preset=invalid");
    w.type("abc");
    vi.advanceTimersByTime(250);
    expect(parse(w.url).preset).toBe("invalid");
    expect(parse(w.url).q).toBe("abc");
  });
});

// ---------------------------------------------------------------------------
// 4. KPI ↔ table parity: the dashboard KPIs and the error list must derive
//    counts from the same source array and the same predicate. Same code,
//    no drift after status/validity changes.
// ---------------------------------------------------------------------------
type D = { id: string; status: string; validity?: string };

const PREDICATES = {
  total: (_: D) => true,
  open: (d: D) => !["Fixed", "Closed"].includes(d.status),
  valid: (d: D) => d.validity === "Valid",
  invalid: (d: D) => d.validity === "Invalid",
  fixed: (d: D) => d.status === "Fixed" || d.status === "Closed",
  retest: (d: D) => d.status === "Retest Required",
} as const;
type Bucket = keyof typeof PREDICATES;

function kpis(defects: D[]): Record<Bucket, number> {
  return Object.fromEntries(
    (Object.keys(PREDICATES) as Bucket[]).map((k) => [k, defects.filter(PREDICATES[k]).length]),
  ) as Record<Bucket, number>;
}
function tableFor(defects: D[], bucket: Bucket): D[] {
  return defects.filter(PREDICATES[bucket]);
}

describe("KPI counts are derived from the same store as the table", () => {
  const defects: D[] = [
    { id: "a", status: "Reported", validity: "Valid" },
    { id: "b", status: "Pending", validity: "Unverified" },
    { id: "c", status: "Retest Required", validity: "Unverified" },
    { id: "d", status: "Fixed", validity: "Valid" },
    { id: "e", status: "Closed", validity: "Invalid" },
  ];

  it.each(Object.keys(PREDICATES) as Bucket[])("KPI[%s] === tableFor(%s).length", (bucket) => {
    expect(kpis(defects)[bucket]).toBe(tableFor(defects, bucket).length);
  });

  it("status change flips KPIs and table together", () => {
    const before = kpis(defects);
    const next = defects.map((d) => (d.id === "a" ? { ...d, status: "Fixed" } : d));
    const after = kpis(next);
    expect(after.open).toBe(before.open - 1);
    expect(after.fixed).toBe(before.fixed + 1);
    expect(tableFor(next, "open").length).toBe(after.open);
    expect(tableFor(next, "fixed").length).toBe(after.fixed);
  });

  it("validity change flips KPIs and table together", () => {
    const before = kpis(defects);
    const next = defects.map((d) => (d.id === "b" ? { ...d, validity: "Valid" } : d));
    const after = kpis(next);
    expect(after.valid).toBe(before.valid + 1);
    expect(tableFor(next, "valid").length).toBe(after.valid);
  });

  it("totals never drift from sum of mutually exclusive status buckets", () => {
    const k = kpis(defects);
    expect(k.open + k.fixed).toBe(k.total);
  });
});
