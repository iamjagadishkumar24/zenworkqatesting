import { describe, it, expect, vi } from "vitest";
import { createQueryBuilder } from "@/test/supabase-mock";

vi.mock("@tanstack/react-start", async () => {
  const { createServerFnFactory } = await import("@/test/server-fn-harness");
  return { createServerFn: createServerFnFactory() };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { __mock: true },
}));
vi.mock("./exportReportedErrors", () => ({
  buildReportedErrorsWorkbook: vi.fn(() => new Uint8Array([1, 2, 3])),
  buildReportedErrorsFilename: vi.fn(() => "report.xlsx"),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn(() => createQueryBuilder({ data: null, error: null })) },
}));

import * as Exp from "./exportJobs.functions";

type Call = (a: { data?: unknown; context?: unknown }) => Promise<unknown>;
const createExportJob = Exp.createExportJob as unknown as Call;
const retryExportJob = Exp.retryExportJob as unknown as Call;
const setAllowAgentExports = Exp.setAllowAgentExports as unknown as Call;
const logDirectExport = Exp.logDirectExport as unknown as Call;

function ctx(opts: { isAdmin?: boolean } = {}) {
  const rpc = vi.fn(async () => ({ data: !!opts.isAdmin, error: null }));
  const from = vi.fn(() => createQueryBuilder({ data: null, error: null }));
  return { supabase: { rpc, from }, userId: "user-1" };
}

describe("exportJobs.functions validators", () => {
  it("createExportJob filters validator accepts environment enum and rejects invalid", async () => {
    await expect(
      createExportJob({
        data: { filters: { environment: "Prod" } },
        context: ctx({ isAdmin: true }),
      }),
    ).rejects.toThrow(/environment/i);
  });

  it("createExportJob accepts a clean filter shape and strips unknowns silently", async () => {
    // Zod strips unknown keys by default with `.parse`. We only assert the validator
    // does not throw for a well-formed shape; we then short-circuit before any DB IO
    // by passing a context that throws on .from().
    const noop = ctx();
    noop.supabase.from = vi.fn(() => {
      throw new Error("STOP_AFTER_VALIDATE");
    });
    await expect(
      createExportJob({
        data: { filters: { environment: "Production", taxYear: "2025", q: "abc" } },
        context: noop,
      }),
    ).rejects.toThrow("STOP_AFTER_VALIDATE");
  });

  it("retryExportJob requires a uuid jobId", async () => {
    await expect(
      retryExportJob({ data: { jobId: "not-a-uuid" }, context: ctx({ isAdmin: true }) }),
    ).rejects.toThrow(/uuid/i);
  });

  it("retryExportJob forbids non-admins", async () => {
    await expect(
      retryExportJob({
        data: { jobId: "11111111-1111-1111-1111-111111111111" },
        context: ctx({ isAdmin: false }),
      }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("setAllowAgentExports validates boolean and forbids non-admins", async () => {
    await expect(
      setAllowAgentExports({ data: { allowed: "yes" as unknown as boolean }, context: ctx({ isAdmin: true }) }),
    ).rejects.toThrow(/boolean/i);
    await expect(
      setAllowAgentExports({ data: { allowed: true }, context: ctx({ isAdmin: false }) }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("logDirectExport validates payload shape", async () => {
    await expect(
      logDirectExport({
        data: { scope: "x", environment: null, filters: {}, rowCount: -1, status: "success" },
        context: ctx(),
      }),
    ).rejects.toThrow(/nonnegative|greater than or equal/i);
    await expect(
      logDirectExport({
        data: { scope: "x", environment: null, filters: {}, rowCount: 1, status: "weird" },
        context: ctx(),
      }),
    ).rejects.toThrow();
  });
});