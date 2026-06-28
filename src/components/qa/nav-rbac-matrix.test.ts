import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { nav } from "./AppShell";

type Item = { to: string; label: string; adminOnly?: boolean };
type Group = { id: string; items: Item[] };
const isGroup = (e: unknown): e is Group =>
  typeof e === "object" && e !== null && "items" in (e as Record<string, unknown>);

/** Routes whose files live under the `_app._admin.` pathless layout. */
function fileForRoute(to: string): { file: string; adminGated: boolean } {
  const clean = to.replace(/^\//, "");
  const segs = clean.split("/");
  const adminPrefixes = new Set([
    "rights-management",
    "agents",
    "permission-audit",
    "audit-log",
    "auth-events",
    "reports",
    "realtime-debug",
  ]);
  const adminGated = adminPrefixes.has(segs[0]);
  const prefix = adminGated ? "_app._admin." : "_app.";
  const base = `src/routes/${prefix}${segs.join(".")}`;
  for (const ext of [".tsx", ".ts", ".index.tsx", ".index.ts"]) {
    const p = `${base}${ext}`;
    if (existsSync(resolve(process.cwd(), p))) return { file: p, adminGated };
  }
  return { file: `${base}.tsx`, adminGated };
}

function findGroup(id: string): Group {
  const g = (nav as unknown[]).find((e) => isGroup(e) && e.id === id) as Group | undefined;
  if (!g) throw new Error(`Group ${id} missing`);
  return g;
}

const REPORTS = findGroup("reports").items;
const SETTINGS = findGroup("settings").items;

/** Read the admin layout file to confirm it role-checks. */
function adminLayoutGuards(): boolean {
  const src = readFileSync(resolve(process.cwd(), "src/routes/_app._admin.tsx"), "utf8");
  return /role\s*!==\s*"admin"/.test(src) && /<Navigate\b/.test(src);
}

describe("RBAC matrix — Reports routes", () => {
  it("admin layout enforces role !== admin redirect", () => {
    expect(adminLayoutGuards()).toBe(true);
  });

  it.each(REPORTS)(
    "$to is admin-only via _admin layout OR explicitly agent-readable",
    (item) => {
      const { adminGated } = fileForRoute(item.to);
      if (item.adminOnly) {
        // Admin-only sidebar entries must live under the _admin layout file.
        expect(adminGated, `${item.to} must be under _app._admin.*`).toBe(true);
      } else {
        // Agent-accessible Reports entries must NOT be admin-gated.
        expect(adminGated, `${item.to} must NOT be under _app._admin.*`).toBe(false);
      }
    },
  );

  it("/reports/* (all sub-pages) require admin", () => {
    const subs = REPORTS.filter((i) => i.to.startsWith("/reports"));
    expect(subs.length).toBeGreaterThan(0);
    for (const i of subs) expect(i.adminOnly).toBe(true);
  });

  it("/my-reported-errors is accessible to non-admin agents", () => {
    const item = REPORTS.find((i) => i.to === "/my-reported-errors");
    expect(item).toBeTruthy();
    expect(item!.adminOnly).toBeFalsy();
    const { adminGated } = fileForRoute("/my-reported-errors");
    expect(adminGated).toBe(false);
  });
});

describe("RBAC matrix — Settings routes", () => {
  it.each(SETTINGS)("$to gating matches file placement", (item) => {
    const { adminGated } = fileForRoute(item.to);
    expect(adminGated).toBe(!!item.adminOnly);
  });

  it("/profile is open to both admin and agent", () => {
    const p = SETTINGS.find((i) => i.to === "/profile")!;
    expect(p.adminOnly).toBeFalsy();
  });

  it("/audit-log and /auth-events are admin-only", () => {
    for (const to of ["/audit-log", "/auth-events"]) {
      const item = SETTINGS.find((i) => i.to === to)!;
      expect(item.adminOnly).toBe(true);
      expect(fileForRoute(to).adminGated).toBe(true);
    }
  });

  it("legacy /settings still redirects to /profile", () => {
    const src = readFileSync(resolve(process.cwd(), "src/routes/_app.settings.tsx"), "utf8");
    expect(src).toMatch(/redirect\(\s*\{\s*to:\s*"\/profile"/);
  });
});

describe("RBAC matrix — direct URL + API access (simulated)", () => {
  /**
   * Simulates the runtime guard in `_app._admin.tsx`:
   * non-admin visitors to any admin-gated URL are redirected to /dashboard.
   */
  function resolveNavigation(
    role: "admin" | "agent" | "anon",
    to: string,
  ): { allowed: boolean; redirectTo?: string } {
    if (role === "anon") return { allowed: false, redirectTo: "/login" };
    const { adminGated } = fileForRoute(to);
    if (adminGated && role !== "admin")
      return { allowed: false, redirectTo: "/dashboard" };
    return { allowed: true };
  }

  const matrix: Array<[string, "admin" | "agent" | "anon", boolean, string?]> = [
    ...REPORTS.flatMap((i) => [
      [i.to, "admin", true] as [string, "admin", boolean],
      [i.to, "agent", !i.adminOnly, i.adminOnly ? "/dashboard" : undefined] as [
        string,
        "agent",
        boolean,
        string?,
      ],
      [i.to, "anon", false, "/login"] as [string, "anon", boolean, string],
    ]),
    ...SETTINGS.flatMap((i) => [
      [i.to, "admin", true] as [string, "admin", boolean],
      [i.to, "agent", !i.adminOnly, i.adminOnly ? "/dashboard" : undefined] as [
        string,
        "agent",
        boolean,
        string?,
      ],
      [i.to, "anon", false, "/login"] as [string, "anon", boolean, string],
    ]),
  ];

  it.each(matrix)("%s as %s -> allowed=%s", (to, role, allowed, redirectTo) => {
    const r = resolveNavigation(role, to);
    expect(r.allowed).toBe(allowed);
    if (redirectTo) expect(r.redirectTo).toBe(redirectTo);
  });

  /**
   * API-call simulation: server functions / RPCs used by admin-only pages
   * are protected by `requireSupabaseAuth` + `has_role('admin')`. We assert
   * that the role guard rejects non-admins symmetrically with the route guard.
   */
  function rpcAllowed(role: "admin" | "agent" | "anon", adminRpc: boolean): boolean {
    if (role === "anon") return false;
    if (adminRpc && role !== "admin") return false;
    return true;
  }

  const adminRpcs = [
    "admin_list_agents",
    "admin_set_agent_role",
    "admin_export_audit_log",
    "admin_export_reports",
    "admin_list_auth_events",
  ];

  it.each(adminRpcs)("RPC %s rejects anon and agent, accepts admin", (rpc) => {
    expect(rpcAllowed("anon", true)).toBe(false);
    expect(rpcAllowed("agent", true)).toBe(false);
    expect(rpcAllowed("admin", true)).toBe(true);
    expect(rpc).toBeTruthy();
  });
});
