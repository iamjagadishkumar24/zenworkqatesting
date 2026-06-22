import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryBuilder } from "@/test/supabase-mock";

vi.mock("@tanstack/react-start", async () => {
  const { createServerFnFactory } = await import("@/test/server-fn-harness");
  return { createServerFn: createServerFnFactory() };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { __mock: true },
}));

type AdminResult = { data?: unknown; error?: unknown; count?: number | null };

const adminState: {
  builders: Array<ReturnType<typeof createQueryBuilder>>;
  results: AdminResult[];
  authAdmin: {
    createUser: ReturnType<typeof vi.fn>;
    updateUserById: ReturnType<typeof vi.fn>;
  };
  getClaims: ReturnType<typeof vi.fn>;
  rpcResult: { data: unknown; error: unknown };
  rpc: ReturnType<typeof vi.fn>;
} = {
  builders: [],
  results: [],
  authAdmin: {
    createUser: vi.fn(),
    updateUserById: vi.fn(),
  },
  getClaims: vi.fn(),
  rpcResult: { data: null, error: null },
  rpc: vi.fn(),
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn(() => {
      const next = adminState.results.shift() ?? { data: null, error: null };
      const b = createQueryBuilder(next as Parameters<typeof createQueryBuilder>[0]);
      adminState.builders.push(b);
      return b;
    }),
    rpc: (...args: unknown[]) => adminState.rpc(...args),
    auth: {
      admin: {
        createUser: (...a: unknown[]) => adminState.authAdmin.createUser(...a),
        updateUserById: (...a: unknown[]) => adminState.authAdmin.updateUserById(...a),
      },
      getClaims: (...a: unknown[]) => adminState.getClaims(...a),
    },
  },
}));

import * as Admin from "./admin.functions";

type Call = (a: { data?: unknown; context?: unknown }) => Promise<unknown>;
const inviteAgent = Admin.inviteAgent as unknown as Call;
const accountStatus = Admin.accountStatus as unknown as Call;
const deactivateAgent = Admin.deactivateAgent as unknown as Call;
const reactivateAgent = Admin.reactivateAgent as unknown as Call;
const checkInviteEmail = Admin.checkInviteEmail as unknown as Call;
const resendAgentInvite = Admin.resendAgentInvite as unknown as Call;
const resetAgentPassword = Admin.resetAgentPassword as unknown as Call;
const updateAgentProfile = Admin.updateAgentProfile as unknown as Call;
const sampleAdminStatus = Admin.sampleAdminStatus as unknown as Call;

function makeCtx(opts: { isAdmin?: boolean; email?: string; userId?: string } = {}) {
  const rpc = vi.fn(async () => ({ data: !!opts.isAdmin, error: null }));
  const from = vi.fn(() => createQueryBuilder({ data: null, error: null }));
  return {
    supabase: { rpc, from },
    userId: opts.userId ?? "admin-1",
    claims: opts.email ? { email: opts.email } : null,
    rpc,
  };
}

function queueAdminResults(...results: AdminResult[]) {
  adminState.results.push(...results);
}

beforeEach(() => {
  adminState.builders.length = 0;
  adminState.results.length = 0;
  adminState.authAdmin.createUser.mockReset();
  adminState.authAdmin.updateUserById.mockReset();
  adminState.getClaims.mockReset();
  adminState.rpc.mockReset();
});

describe("admin.functions validators", () => {
  it("inviteAgent rejects invalid emails, short names, weak passwords", async () => {
    const c = makeCtx({ isAdmin: true });
    await expect(
      inviteAgent({ data: { email: "bad", name: "X", password: "short" }, context: c }),
    ).rejects.toThrow(/valid email/);
    await expect(
      inviteAgent({ data: { email: "a@b.co", name: "X", password: "longenough" }, context: c }),
    ).rejects.toThrow(/Name is required/);
    await expect(
      inviteAgent({ data: { email: "a@b.co", name: "Alice", password: "short" }, context: c }),
    ).rejects.toThrow(/at least 8/);
  });

  it("accountStatus rejects bad email and prevents enumeration of other users", async () => {
    await expect(
      accountStatus({ data: { email: "nope" }, context: makeCtx({ email: "me@a.co" }) }),
    ).rejects.toThrow(/valid email/);
    await expect(
      accountStatus({ data: { email: "other@a.co" }, context: makeCtx({ email: "me@a.co" }) }),
    ).rejects.toThrow(/Forbidden/);
  });

  it("deactivateAgent: requires admin, requires userId, blocks self-removal, blocks protected admin", async () => {
    await expect(
      deactivateAgent({ data: { userId: "u1" }, context: makeCtx({ isAdmin: false }) }),
    ).rejects.toThrow(/Only admins/);
    await expect(
      deactivateAgent({ data: { userId: "" }, context: makeCtx({ isAdmin: true }) }),
    ).rejects.toThrow(/userId required/);
    await expect(
      deactivateAgent({
        data: { userId: "admin-1" },
        context: makeCtx({ isAdmin: true, userId: "admin-1" }),
      }),
    ).rejects.toThrow(/your own account/);
    queueAdminResults({ data: { email: "admin@qaportal.app" }, error: null });
    await expect(
      deactivateAgent({ data: { userId: "u9" }, context: makeCtx({ isAdmin: true }) }),
    ).rejects.toThrow(/main admin account cannot be removed/);
  });

  it("reactivateAgent gates on admin and writes profile + auth + audit", async () => {
    await expect(
      reactivateAgent({ data: { userId: "u1" }, context: makeCtx({ isAdmin: false }) }),
    ).rejects.toThrow(/Only admins/);
    queueAdminResults(
      { data: { email: "a@b.co", name: "Alice" }, error: null }, // profile lookup
      { data: null, error: null }, // profiles update
      { data: null, error: null }, // agent_invites update
      { data: { name: "Admin" }, error: null }, // getActorName profile lookup
      { data: null, error: null }, // agent_audit_log insert
    );
    adminState.authAdmin.updateUserById.mockResolvedValueOnce({ error: null });
    const out = (await reactivateAgent({
      data: { userId: "u1" },
      context: makeCtx({ isAdmin: true }),
    })) as { ok: true };
    expect(out.ok).toBe(true);
    expect(adminState.authAdmin.updateUserById).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ ban_duration: "none" }),
    );
    const auditInsert = adminState.builders[adminState.builders.length - 1].calls.find(
      (x: { method: string }) => x.method === "insert",
    );
    expect((auditInsert?.args[0] as { action: string }).action).toBe("agent_reactivated");
  });

  it("checkInviteEmail returns not_invited / inactive / allowed", async () => {
    queueAdminResults({ data: null, error: null });
    expect(await checkInviteEmail({ data: { email: "x@y.co" }, context: {} })).toEqual({
      allowed: false,
      reason: "not_invited",
    });
    queueAdminResults({ data: { status: "inactive", user_id: null }, error: null });
    expect(await checkInviteEmail({ data: { email: "x@y.co" }, context: {} })).toEqual({
      allowed: false,
      reason: "inactive",
    });
    queueAdminResults({ data: { status: "pending", user_id: "u9" }, error: null });
    expect(await checkInviteEmail({ data: { email: "x@y.co" }, context: {} })).toEqual({
      allowed: true,
      alreadyRegistered: true,
    });
  });

  it("resendAgentInvite distinguishes not_invited / inactive / already_active / pending", async () => {
    const ctxAdmin = makeCtx({ isAdmin: true });
    queueAdminResults({ data: null, error: null });
    const r1 = (await resendAgentInvite({
      data: { email: "x@y.co" },
      context: ctxAdmin,
    })) as { ok: boolean; status: string };
    expect(r1).toMatchObject({ ok: false, status: "not_invited" });

    queueAdminResults({ data: { id: 1, email: "x@y.co", name: "X", status: "inactive", user_id: null }, error: null });
    const r2 = (await resendAgentInvite({ data: { email: "x@y.co" }, context: ctxAdmin })) as { status: string };
    expect(r2.status).toBe("inactive");

    queueAdminResults({ data: { id: 1, email: "x@y.co", name: "X", status: "pending", user_id: "u1" }, error: null });
    const r3 = (await resendAgentInvite({ data: { email: "x@y.co" }, context: ctxAdmin })) as { status: string };
    expect(r3.status).toBe("already_active");

    queueAdminResults(
      { data: { id: 7, email: "x@y.co", name: "X", status: "pending", user_id: null }, error: null }, // invite lookup
      { data: null, error: null }, // update
      { data: { name: "Admin" }, error: null }, // getActorName
      { data: null, error: null }, // audit insert
    );
    const r4 = (await resendAgentInvite({ data: { email: "x@y.co" }, context: ctxAdmin })) as {
      ok: boolean;
      status: string;
      email: string;
    };
    expect(r4).toMatchObject({ ok: true, status: "pending", email: "x@y.co" });
  });

  it("resetAgentPassword validators reject missing userId and weak password", async () => {
    await expect(
      resetAgentPassword({ data: { userId: "", password: "longenough" }, context: makeCtx({ isAdmin: true }) }),
    ).rejects.toThrow(/userId required/);
    await expect(
      resetAgentPassword({ data: { userId: "u1", password: "short" }, context: makeCtx({ isAdmin: true }) }),
    ).rejects.toThrow(/at least 8/);
  });

  it("updateAgentProfile validates name/email/role and gates on admin", async () => {
    await expect(
      updateAgentProfile({ data: { userId: "u1", role: "owner" as unknown as "admin" }, context: makeCtx({ isAdmin: true }) }),
    ).rejects.toThrow(/Invalid role/);
    await expect(
      updateAgentProfile({ data: { userId: "u1", name: "x" }, context: makeCtx({ isAdmin: true }) }),
    ).rejects.toThrow(/Name is required/);
    await expect(
      updateAgentProfile({ data: { userId: "u1", email: "bad" }, context: makeCtx({ isAdmin: true }) }),
    ).rejects.toThrow(/valid email/);
    await expect(
      updateAgentProfile({ data: { userId: "u1", name: "Alice" }, context: makeCtx({ isAdmin: false }) }),
    ).rejects.toThrow(/Only admins/);
  });

  it("sampleAdminStatus forbids non-admins", async () => {
    await expect(sampleAdminStatus({ context: makeCtx({ isAdmin: false }) })).rejects.toThrow(/Forbidden/);
  });
});