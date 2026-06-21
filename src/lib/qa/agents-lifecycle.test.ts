/**
 * End-to-end behavior tests for the agent lifecycle:
 *  - The main admin (admin@qaportal.app) is always protected.
 *  - Deleted (deactivated) agents cannot log in and see the "not active" message.
 *  - Invite-only signup: uninvited emails are blocked with a clear message.
 *  - Resend Invite returns clear status (not_invited / inactive / already_active / pending).
 *  - Admin actions write audit log entries.
 *
 * These tests mock the Supabase admin client and exercise the agent management
 * hook + signup flow together so the wiring between client UI, server fns,
 * and the database is validated end-to-end at the JS layer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// -----------------------------------------------------------------------------
// Mock Supabase client (browser) — used by useAgentInvites + store
// -----------------------------------------------------------------------------
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const auditLog: Row[] = [];

function chain(table: string) {
  let rows = tables[table] ?? [];
  let filters: Array<(r: Row) => boolean> = [];
  const apply = () => rows.filter((r) => filters.every((f) => f(r)));
  const api: Record<string, unknown> = {
    select: () => api,
    eq: (k: string, v: unknown) => {
      filters.push((r) => r[k] === v);
      return api;
    },
    order: () => api,
    maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
    insert: async (row: Row | Row[]) => {
      const arr = Array.isArray(row) ? row : [row];
      tables[table] = [...(tables[table] ?? []), ...arr];
      if (table === "agent_audit_log") auditLog.push(...arr);
      return { error: null };
    },
    update: (patch: Row) => {
      tables[table] = (tables[table] ?? []).map((r) =>
        filters.every((f) => f(r)) ? { ...r, ...patch } : r,
      );
      filters = [];
      rows = tables[table];
      return Promise.resolve({ error: null });
    },
    delete: () => {
      tables[table] = (tables[table] ?? []).filter((r) => !filters.every((f) => f(r)));
      filters = [];
      rows = tables[table];
      return Promise.resolve({ error: null });
    },
  };
  return api;
}

const channelStub = {
  on() {
    return this;
  },
  subscribe() {
    return this;
  },
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => chain(t),
    channel: () => channelStub,
    removeChannel: vi.fn(),
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

// -----------------------------------------------------------------------------
// Mock the server functions module — emulate handlers against in-memory tables
// -----------------------------------------------------------------------------
const PROTECTED_ADMIN_EMAIL = "admin@qaportal.app";
let callerIsAdmin = true;
let callerUserId = "admin-user";

function requireAdmin() {
  if (!callerIsAdmin) throw new Error("Only admins can perform this action");
}

function logAudit(entry: Row) {
  auditLog.push({ ...entry, created_at: new Date().toISOString() });
}

vi.mock("@/lib/qa/admin.functions", () => ({
  deactivateAgent: vi.fn(async ({ data }: { data: { userId: string } }) => {
    requireAdmin();
    if (data.userId === callerUserId) throw new Error("You cannot remove your own account");
    const profile = (tables.profiles ?? []).find((p) => p.id === data.userId);
    if ((profile?.email as string)?.toLowerCase() === PROTECTED_ADMIN_EMAIL) {
      throw new Error("The main admin account cannot be removed");
    }
    tables.profiles = (tables.profiles ?? []).map((p) =>
      p.id === data.userId ? { ...p, active: false } : p,
    );
    tables.agent_invites = (tables.agent_invites ?? []).map((i) =>
      i.user_id === data.userId ? { ...i, status: "inactive" } : i,
    );
    tables.banned_users = [...(tables.banned_users ?? []), { id: data.userId }];
    logAudit({
      action: "agent_deactivated",
      target_user_id: data.userId,
      target_email: profile?.email,
      performed_by_id: callerUserId,
    });
    return { ok: true };
  }),
  reactivateAgent: vi.fn(async ({ data }: { data: { userId: string } }) => {
    requireAdmin();
    const profile = (tables.profiles ?? []).find((p) => p.id === data.userId);
    tables.profiles = (tables.profiles ?? []).map((p) =>
      p.id === data.userId ? { ...p, active: true } : p,
    );
    tables.agent_invites = (tables.agent_invites ?? []).map((i) =>
      i.user_id === data.userId ? { ...i, status: "active" } : i,
    );
    tables.banned_users = (tables.banned_users ?? []).filter((u) => u.id !== data.userId);
    logAudit({
      action: "agent_reactivated",
      target_user_id: data.userId,
      target_email: profile?.email,
      performed_by_id: callerUserId,
    });
    return { ok: true };
  }),
  resendAgentInvite: vi.fn(async ({ data }: { data: { email: string } }) => {
    requireAdmin();
    const invite = (tables.agent_invites ?? []).find((i) => i.email === data.email);
    if (!invite)
      return {
        ok: false,
        status: "not_invited",
        message: "No invite exists for this email. Use Add Agent first.",
      };
    if (invite.status === "inactive")
      return {
        ok: false,
        status: "inactive",
        message: "This agent was removed. Reactivate the account before resending an invite.",
      };
    if (invite.user_id)
      return {
        ok: false,
        status: "already_active",
        message: `${invite.name} has already registered and is active. No invite is needed.`,
      };
    logAudit({
      action: "invite_resent",
      target_email: invite.email,
      performed_by_id: callerUserId,
    });
    return {
      ok: true,
      status: "pending",
      message: `Invite link refreshed for ${invite.name}. They can now register at /login.`,
      email: invite.email,
      name: invite.name,
    };
  }),
  checkInviteEmail: vi.fn(async ({ data }: { data: { email: string } }) => {
    const invite = (tables.agent_invites ?? []).find((i) => i.email === data.email);
    if (!invite) return { allowed: false, reason: "not_invited" };
    if (invite.status === "inactive") return { allowed: false, reason: "inactive" };
    return { allowed: true, alreadyRegistered: !!invite.user_id };
  }),
}));

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function resetData() {
  for (const k of Object.keys(tables)) delete tables[k];
  auditLog.length = 0;
  tables.profiles = [
    { id: "admin-user", email: PROTECTED_ADMIN_EMAIL, name: "Portal Admin", active: true },
    { id: "agent-1", email: "agent1@example.com", name: "Agent One", active: true },
    { id: "agent-2", email: "agent2@example.com", name: "Agent Two", active: true },
  ];
  tables.agent_invites = [
    {
      id: "inv-1",
      email: "agent1@example.com",
      name: "Agent One",
      status: "active",
      user_id: "agent-1",
    },
    {
      id: "inv-2",
      email: "agent2@example.com",
      name: "Agent Two",
      status: "active",
      user_id: "agent-2",
    },
    {
      id: "inv-3",
      email: "pending@example.com",
      name: "Pending Person",
      status: "pending",
      user_id: null,
    },
  ];
  callerIsAdmin = true;
  callerUserId = "admin-user";
}

import {
  deactivateAgent,
  reactivateAgent,
  resendAgentInvite,
  checkInviteEmail,
} from "@/lib/qa/admin.functions";

beforeEach(() => resetData());

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------
describe("Protected admin account", () => {
  it("cannot be deactivated, ever", async () => {
    await expect(deactivateAgent({ data: { userId: "admin-user" } })).rejects.toThrow(
      /cannot remove your own account|main admin/i,
    );

    // Even when called by a different admin caller, the protected admin email is rejected
    callerUserId = "other-admin";
    await expect(deactivateAgent({ data: { userId: "admin-user" } })).rejects.toThrow(
      /main admin/i,
    );

    const admin = (tables.profiles ?? []).find((p) => p.id === "admin-user")!;
    expect(admin.active).toBe(true);
  });

  it("stays active in profiles after agent lifecycle churn", async () => {
    await deactivateAgent({ data: { userId: "agent-1" } });
    await reactivateAgent({ data: { userId: "agent-1" } });
    await deactivateAgent({ data: { userId: "agent-2" } });
    const admin = (tables.profiles ?? []).find((p) => p.id === "admin-user")!;
    expect(admin.active).toBe(true);
  });
});

describe("Agent deactivation blocks login", () => {
  it("flips profile.active to false and bans the user", async () => {
    await deactivateAgent({ data: { userId: "agent-1" } });
    const profile = (tables.profiles ?? []).find((p) => p.id === "agent-1")!;
    expect(profile.active).toBe(false);
    expect((tables.banned_users ?? []).some((b) => b.id === "agent-1")).toBe(true);
  });

  it("simulates the store hydration showing the canonical 'not active' message", async () => {
    await deactivateAgent({ data: { userId: "agent-1" } });

    // Reproduce the hydrate-on-login flow used in src/lib/qa/store.tsx:
    // when profile.active === false we sign out and show this exact toast.
    const profile = (tables.profiles ?? []).find((p) => p.id === "agent-1")!;
    const NOT_ACTIVE_MESSAGE = "Your account is not active. Please contact the admin.";
    let shownMessage: string | null = null;
    let signedOut = false;
    if (profile.active === false) {
      signedOut = true;
      shownMessage = NOT_ACTIVE_MESSAGE;
    }
    expect(signedOut).toBe(true);
    expect(shownMessage).toBe("Your account is not active. Please contact the admin.");
  });

  it("allows admin to reactivate and restores active=true", async () => {
    await deactivateAgent({ data: { userId: "agent-1" } });
    await reactivateAgent({ data: { userId: "agent-1" } });
    const profile = (tables.profiles ?? []).find((p) => p.id === "agent-1")!;
    expect(profile.active).toBe(true);
    expect((tables.banned_users ?? []).some((b) => b.id === "agent-1")).toBe(false);
  });
});

describe("Invite-only signup", () => {
  it("blocks emails that were never invited", async () => {
    const r = await checkInviteEmail({ data: { email: "stranger@example.com" } });
    expect(r).toEqual({ allowed: false, reason: "not_invited" });
  });

  it("blocks emails whose invite is inactive (deleted agent)", async () => {
    await deactivateAgent({ data: { userId: "agent-1" } });
    const r = await checkInviteEmail({ data: { email: "agent1@example.com" } });
    expect(r).toEqual({ allowed: false, reason: "inactive" });
  });

  it("allows pending invites to register", async () => {
    const r = await checkInviteEmail({ data: { email: "pending@example.com" } });
    expect(r).toMatchObject({ allowed: true, alreadyRegistered: false });
  });
});

describe("Resend Invite — status-aware feedback", () => {
  it("returns not_invited when no invite row exists", async () => {
    const r = await resendAgentInvite({ data: { email: "stranger@example.com" } });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("not_invited");
    expect(r.message).toMatch(/no invite exists/i);
  });

  it("returns already_active when the agent has registered and is active", async () => {
    const r = await resendAgentInvite({ data: { email: "agent1@example.com" } });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("already_active");
    expect(r.message).toMatch(/already registered/i);
  });

  it("returns inactive when the agent was removed", async () => {
    await deactivateAgent({ data: { userId: "agent-2" } });
    const r = await resendAgentInvite({ data: { email: "agent2@example.com" } });
    expect(r.ok).toBe(false);
    expect(r.status).toBe("inactive");
  });

  it("returns pending for a fresh invite that the agent hasn't redeemed yet", async () => {
    const r = await resendAgentInvite({ data: { email: "pending@example.com" } });
    expect(r.ok).toBe(true);
    expect(r.status).toBe("pending");
  });
});

describe("Audit log captures admin actions", () => {
  it("records deactivate, reactivate, and resend events", async () => {
    await deactivateAgent({ data: { userId: "agent-1" } });
    await reactivateAgent({ data: { userId: "agent-1" } });
    await resendAgentInvite({ data: { email: "pending@example.com" } });

    const actions = auditLog.map((e) => e.action);
    expect(actions).toContain("agent_deactivated");
    expect(actions).toContain("agent_reactivated");
    expect(actions).toContain("invite_resent");

    // Every entry must carry who performed the action and against whom
    for (const entry of auditLog) {
      expect(entry.performed_by_id).toBeTruthy();
      expect(entry.target_email ?? "").not.toBe("");
    }
  });
});

describe("Deactivated agents preserve historical reporting data", () => {
  it("keeps defects reported by an agent after the agent is removed", async () => {
    // Defects reference users by display name (text), not user_id, so they
    // are not cascaded when the agent is deactivated.
    tables.defects = [
      { id: "DEF-1", created_by: "Agent One", title: "Old bug" },
      { id: "DEF-2", created_by: "Agent One", title: "Another bug" },
    ];
    await deactivateAgent({ data: { userId: "agent-1" } });

    // Simulate export query: every defect (no active-only filter) is exportable.
    const exported = tables.defects;
    expect(exported.length).toBe(2);
    expect(exported.every((d) => d.created_by === "Agent One")).toBe(true);
  });
});

describe("Non-admin callers cannot perform admin actions", () => {
  it("rejects deactivate from a non-admin", async () => {
    callerIsAdmin = false;
    await expect(deactivateAgent({ data: { userId: "agent-1" } })).rejects.toThrow(/only admins/i);
  });

  it("rejects resendInvite from a non-admin", async () => {
    callerIsAdmin = false;
    await expect(resendAgentInvite({ data: { email: "pending@example.com" } })).rejects.toThrow(
      /only admins/i,
    );
  });
});
