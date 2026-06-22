import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let lastInsert: Row | null = null;
let nextError: { message: string } | null = null;

function chain(table: string) {
  const api: Record<string, unknown> = {
    select: () => api,
    order: async () => ({ data: tables[table] ?? [], error: null }),
    eq: () => api,
    insert: async (row: Row | Row[]) => {
      const arr = Array.isArray(row) ? row : [row];
      lastInsert = arr[0]!;
      if (nextError) {
        const e = nextError;
        nextError = null;
        return { error: e };
      }
      tables[table] = [...(tables[table] ?? []), ...arr];
      return { error: null };
    },
    update: async () => ({ error: nextError ? (nextError = null, { message: "x" }) : null }),
    delete: async () => ({ error: null }),
  };
  // order() returns thenable above; eq() should also be terminal awaitable for updates/deletes
  return api;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => chain(t),
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("./store", () => ({
  useQA: () => ({ currentUser: { id: "admin-1", name: "Portal Admin", role: "admin" } }),
}));

vi.mock("./admin.functions", () => ({
  deactivateAgent: vi.fn(async () => ({ ok: true })),
  reactivateAgent: vi.fn(async () => ({ ok: true })),
  resendAgentInvite: vi.fn(async () => ({ ok: true, status: "pending" })),
  resetAgentPassword: vi.fn(async () => ({ ok: true })),
  updateAgentProfile: vi.fn(async () => ({ ok: true })),
}));

import { useAgentInvites } from "./agents";

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  lastInsert = null;
  nextError = null;
});

describe("useAgentInvites.create — input validation", () => {
  it("rejects an invalid email format", async () => {
    const { result } = renderHook(() => useAgentInvites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res!: { ok: boolean; error?: string };
    await act(async () => {
      res = await result.current.create({ email: "not-an-email", name: "Jane" });
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/valid email/i);
    expect(lastInsert).toBeNull();
  });

  it("rejects a missing/short name", async () => {
    const { result } = renderHook(() => useAgentInvites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res!: { ok: boolean; error?: string };
    await act(async () => {
      res = await result.current.create({ email: "a@b.co", name: "A" });
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/name/i);
  });

  it("normalises email casing/whitespace before insert", async () => {
    const { result } = renderHook(() => useAgentInvites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.create({ email: "  Foo@Bar.COM  ", name: " Jane Doe " });
    });
    expect(lastInsert).toMatchObject({
      email: "foo@bar.com",
      name: "Jane Doe",
      created_by: "admin-1",
    });
  });

  it("propagates a database error from insert", async () => {
    const { result } = renderHook(() => useAgentInvites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    nextError = { message: "duplicate key" };
    let res!: { ok: boolean; error?: string };
    await act(async () => {
      res = await result.current.create({ email: "a@b.co", name: "Jane" });
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("duplicate key");
  });
});

describe("useAgentInvites server-fn wrappers", () => {
  it("deactivate/reactivate return ok on success", async () => {
    const { result } = renderHook(() => useAgentInvites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.deactivate("u1")).resolves.toEqual({ ok: true });
    await expect(result.current.reactivate("u1")).resolves.toEqual({ ok: true });
  });
});