import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

type Row = { user_id: string; name: string; filters: unknown };
const tables: { report_views: Row[] } = { report_views: [] };
let lastUpsert: Row | null = null;
let lastDelete: { user_id?: string; name?: string } | null = null;
let userId: string | null = "user-1";

function makeQuery(rows: Row[]) {
  const filters: Array<(r: Row) => boolean> = [];
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (k: string, v: unknown) => {
      filters.push((r) => (r as Record<string, unknown>)[k] === v);
      return q;
    },
    order: async () => ({
      data: rows.filter((r) => filters.every((f) => f(r))),
      error: null,
    }),
    contains: () => q,
    delete: () => ({
      eq: (k: string, v: unknown) => {
        if (k === "user_id") lastDelete = { ...(lastDelete ?? {}), user_id: String(v) };
        if (k === "name") lastDelete = { ...(lastDelete ?? {}), name: String(v) };
        return {
          eq: (k2: string, v2: unknown) => {
            if (k2 === "name") lastDelete = { ...(lastDelete ?? {}), name: String(v2) };
            return Promise.resolve({ error: null });
          },
          then: (res: (v: { error: null }) => void) => res({ error: null }),
        };
      },
    }),
    upsert: async (row: Row | Row[]) => {
      const arr = Array.isArray(row) ? row : [row];
      lastUpsert = arr[0]!;
      const others = rows.filter(
        (r) => !arr.some((a) => a.user_id === r.user_id && a.name === r.name),
      );
      tables.report_views = [...others, ...arr];
      return { error: null };
    },
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => makeQuery(tables.report_views),
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: vi.fn(),
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

import { useSavedViews, type ReportFilters } from "./reportsViews";

const BLANK: ReportFilters = {
  status: "",
  testingType: "",
  category: "",
  agent: "",
  dateRange: "",
  fromDate: "",
  toDate: "",
  state: "",
};

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  tables.report_views = [];
  lastUpsert = null;
  lastDelete = null;
  userId = "user-1";
  window.localStorage.clear();
});

describe("useSavedViews", () => {
  it("hydrates from supabase, sorted by name", async () => {
    tables.report_views = [
      { user_id: "user-1", name: "Beta", filters: BLANK },
      { user_id: "user-1", name: "Alpha", filters: BLANK },
      { user_id: "other", name: "ShouldNotSee", filters: BLANK },
    ];
    const { result } = renderHook(() => useSavedViews());
    await act(async () => {
      await flush();
    });
    const names = result.current.views.map((v) => v.name).sort();
    expect(names).toEqual(["Alpha", "Beta"]);
  });

  it("ignores save calls with a blank name", async () => {
    const { result } = renderHook(() => useSavedViews());
    await act(async () => {
      await flush();
    });
    await act(async () => {
      await result.current.save("   ", BLANK);
    });
    expect(lastUpsert).toBeNull();
    expect(result.current.views).toHaveLength(0);
  });

  it("trims the name and replaces existing entry with the same key", async () => {
    tables.report_views = [{ user_id: "user-1", name: "Weekly", filters: BLANK }];
    const { result } = renderHook(() => useSavedViews());
    await act(async () => {
      await flush();
    });

    const filters = { ...BLANK, status: "Open" };
    await act(async () => {
      await result.current.save("  Weekly  ", filters);
    });
    expect(lastUpsert).toEqual({
      user_id: "user-1",
      name: "Weekly",
      filters,
    });
    // Local state replaces (not duplicates) the existing entry
    const matching = result.current.views.filter((v) => v.name === "Weekly");
    expect(matching).toHaveLength(1);
    expect(matching[0].filters).toEqual(filters);
  });

  it("removes a view by name and forwards user_id scoping", async () => {
    tables.report_views = [
      { user_id: "user-1", name: "A", filters: BLANK },
      { user_id: "user-1", name: "B", filters: BLANK },
    ];
    const { result } = renderHook(() => useSavedViews());
    await act(async () => {
      await flush();
    });
    await act(async () => {
      await result.current.remove("A");
    });
    expect(result.current.views.map((v) => v.name)).toEqual(["B"]);
    expect(lastDelete).toEqual({ user_id: "user-1", name: "A" });
  });

  it("no-ops save/remove when no user is signed in", async () => {
    userId = null;
    const { result } = renderHook(() => useSavedViews());
    await act(async () => {
      await flush();
    });
    await act(async () => {
      await result.current.save("X", BLANK);
      await result.current.remove("X");
    });
    expect(lastUpsert).toBeNull();
    expect(lastDelete).toBeNull();
    expect(result.current.views).toEqual([]);
  });
});
