import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const flush = () => new Promise((r) => setTimeout(r, 0));

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const lastInserts: Record<string, Row | null> = {};
let nextError: { message: string } | null = null;

function chain(table: string) {
  const api: Record<string, unknown> = {
    select: () => api,
    order: async () => ({ data: tables[table] ?? [], error: null }),
    eq: () => api,
    insert: async (row: Row | Row[]) => {
      const arr = Array.isArray(row) ? row : [row];
      lastInserts[table] = arr[0]!;
      if (nextError) {
        const e = nextError;
        nextError = null;
        return { error: e };
      }
      tables[table] = [...(tables[table] ?? []), ...arr];
      return { error: null };
    },
    update: async () => ({ error: nextError ? ((nextError = null), { message: "x" }) : null }),
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

const STABLE_USER = { id: "admin-1", name: "Portal Admin", role: "admin" as const };
vi.mock("./store", () => ({
  useQA: () => ({ currentUser: STABLE_USER }),
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
  for (const k of Object.keys(lastInserts)) delete lastInserts[k];
  nextError = null;
});

describe("useAgentInvites.create — input validation", () => {
  it("rejects an invalid email format", async () => {
    const { result } = renderHook(() => useAgentInvites());
    await act(async () => {
      await flush();
    });
    let res!: { ok: boolean; error?: string };
    await act(async () => {
      res = await result.current.create({ email: "not-an-email", name: "Jane" });
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/valid email/i);
    expect(lastInserts.agent_invites).toBeUndefined();
  });

  it("rejects a missing/short name", async () => {
    const { result } = renderHook(() => useAgentInvites());
    await act(async () => {
      await flush();
    });
    let res!: { ok: boolean; error?: string };
    await act(async () => {
      res = await result.current.create({ email: "a@b.co", name: "A" });
    });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/name/i);
  });

  it("normalises email casing/whitespace before insert", async () => {
    const { result } = renderHook(() => useAgentInvites());
    await act(async () => {
      await flush();
    });
    await act(async () => {
      await result.current.create({ email: "  Foo@Bar.COM  ", name: " Jane Doe " });
    });
    expect(lastInserts.agent_invites).toMatchObject({
      email: "foo@bar.com",
      name: "Jane Doe",
      created_by: "admin-1",
    });
  });

  it("propagates a database error from insert", async () => {
    const { result } = renderHook(() => useAgentInvites());
    await act(async () => {
      await flush();
    });
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
    await act(async () => {
      await flush();
    });
    await expect(result.current.deactivate("u1")).resolves.toEqual({ ok: true });
    await expect(result.current.reactivate("u1")).resolves.toEqual({ ok: true });
  });
});
