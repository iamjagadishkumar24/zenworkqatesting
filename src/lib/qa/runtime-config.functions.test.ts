import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "@/test/supabase-mock";

vi.mock("@tanstack/react-start", async () => {
  const { createServerFnFactory } = await import("@/test/server-fn-harness");
  return { createServerFn: createServerFnFactory() };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { __mock: true },
}));

// supabaseAdmin lookups inside the handler are dynamic-imported; vi.mock still
// intercepts dynamic imports.
const adminBuilders: Array<ReturnType<typeof createQueryBuilder>> = [];
let adminResult: { data?: unknown; error?: unknown } = { data: null, error: null };
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const b = createQueryBuilder(adminResult as Parameters<typeof createQueryBuilder>[0]);
      adminBuilders.push(b);
      return b;
    }),
  },
}));

import * as RC from "./runtime-config.functions";

type Call = (a: { data?: unknown; context?: unknown }) => Promise<unknown>;
const getQARuntimeConfig = RC.getQARuntimeConfig as unknown as Call;
const updateQARuntimeConfig = RC.updateQARuntimeConfig as unknown as Call;
const listQARuntimeConfigAudit = RC.listQARuntimeConfigAudit as unknown as Call;

function makeCtx(
  opts: {
    isAdmin?: boolean;
    listResult?: { data?: unknown; error?: unknown; count?: number | null };
  } = {},
) {
  const rpc = vi.fn(async () => ({ data: !!opts.isAdmin, error: null }));
  const builders: Array<ReturnType<typeof createQueryBuilder>> = [];
  const from = vi.fn(() => {
    const b = createQueryBuilder(
      (opts.listResult ?? { data: [], error: null, count: 0 }) as Parameters<
        typeof createQueryBuilder
      >[0],
    );
    builders.push(b);
    return b;
  });
  return { supabase: { rpc, from }, userId: "user-1", builders };
}

beforeEach(() => {
  adminBuilders.length = 0;
  adminResult = { data: null, error: null };
});

describe("runtime-config.functions", () => {
  it("getQARuntimeConfig falls back to env defaults when DB row missing", async () => {
    adminResult = { data: null, error: null };
    const out = (await getQARuntimeConfig({})) as {
      liveEnabled: boolean;
      performanceMode: boolean;
      updatedAt: string | null;
    };
    expect(out.liveEnabled).toBe(true);
    expect(out.performanceMode).toBe(false);
    expect(out.updatedAt).toBeNull();
  });

  it("getQARuntimeConfig maps DB row to camelCase shape", async () => {
    adminResult = {
      data: { live_enabled: false, performance_mode: true, updated_at: "2025-01-01T00:00:00Z" },
      error: null,
    };
    const out = (await getQARuntimeConfig({})) as {
      liveEnabled: boolean;
      performanceMode: boolean;
      updatedAt: string | null;
    };
    expect(out).toEqual({
      liveEnabled: false,
      performanceMode: true,
      updatedAt: "2025-01-01T00:00:00Z",
    });
  });

  it("updateQARuntimeConfig rejects non-boolean payloads", async () => {
    const c = makeCtx({ isAdmin: true });
    await expect(
      updateQARuntimeConfig({ data: { liveEnabled: "yes", performanceMode: false }, context: c }),
    ).rejects.toThrow("Invalid payload");
  });

  it("updateQARuntimeConfig forbids non-admin callers", async () => {
    const c = makeCtx({ isAdmin: false });
    await expect(
      updateQARuntimeConfig({ data: { liveEnabled: true, performanceMode: true }, context: c }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("listQARuntimeConfigAudit clamps page/pageSize and computes range", async () => {
    const c = makeCtx({
      isAdmin: true,
      listResult: { data: [], error: null, count: 0 },
    });
    await listQARuntimeConfigAudit({ data: { page: -5, pageSize: 5000 }, context: c });
    const b = c.builders[c.builders.length - 1];
    const range = b.calls.find((x: { method: string }) => x.method === "range");
    // page=1, pageSize=100 -> range(0, 99)
    expect(range?.args).toEqual([0, 99]);
    const order = b.calls.find((x: { method: string }) => x.method === "order");
    expect(order?.args).toEqual(["created_at", { ascending: false }]);
  });

  it("listQARuntimeConfigAudit forbids non-admin", async () => {
    const c = makeCtx({ isAdmin: false });
    await expect(listQARuntimeConfigAudit({ data: {}, context: c })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("listQARuntimeConfigAudit maps DB rows and returns pagination metadata", async () => {
    const c = makeCtx({
      isAdmin: true,
      listResult: {
        data: [
          {
            id: "a1",
            old_live_enabled: true,
            new_live_enabled: false,
            old_performance_mode: false,
            new_performance_mode: true,
            changed_by_id: "u1",
            changed_by_name: "Alice",
            changed_by_email: "a@b",
            created_at: "2025-01-01",
          },
        ],
        error: null,
        count: 42,
      },
    });
    const out = (await listQARuntimeConfigAudit({
      data: { page: 2, pageSize: 10 },
      context: c,
    })) as {
      entries: Array<{ id: string; newLiveEnabled: boolean }>;
      total: number;
      page: number;
      pageSize: number;
    };
    expect(out.total).toBe(42);
    expect(out.page).toBe(2);
    expect(out.pageSize).toBe(10);
    expect(out.entries[0]).toMatchObject({ id: "a1", newLiveEnabled: false });
    const range = c.builders[c.builders.length - 1].calls.find(
      (x: { method: string }) => x.method === "range",
    );
    expect(range?.args).toEqual([10, 19]);
  });
});
