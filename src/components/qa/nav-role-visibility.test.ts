import { describe, it, expect } from "vitest";
import { nav, getVisibleNav } from "./AppShell";

describe("Sidebar nav visibility by role", () => {
  const admin = getVisibleNav(nav, true);
  const agent = getVisibleNav(nav, false);

  it("renders Management, Reports, and Settings as expandable groups for admins", () => {
    for (const id of ["management", "reports", "settings"]) {
      const entry = admin.find((e) => e.kind === "group" && e.id === id);
      expect(entry, `admin should see group ${id}`).toBeDefined();
      if (entry && entry.kind === "group") {
        expect(entry.items.length).toBeGreaterThan(1);
      }
    }
  });

  it("admin sees admin-only submenu items (e.g. Audit Logs, Agents, Error Reports)", () => {
    const settings = admin.find((e) => e.kind === "group" && e.id === "settings");
    const management = admin.find((e) => e.kind === "group" && e.id === "management");
    const reports = admin.find((e) => e.kind === "group" && e.id === "reports");
    if (settings?.kind !== "group" || management?.kind !== "group" || reports?.kind !== "group") {
      throw new Error("expected groups for admin");
    }
    expect(settings.items.map((i) => i.to)).toEqual(
      expect.arrayContaining(["/profile", "/audit-log", "/auth-events"]),
    );
    expect(management.items.map((i) => i.to)).toEqual(
      expect.arrayContaining(["/retest", "/agents"]),
    );
    expect(reports.items.map((i) => i.to)).toEqual(expect.arrayContaining(["/reports"]));
  });

  it("admin sees the admin-only top-level Rights Management entry", () => {
    expect(admin.some((e) => e.kind === "link" && e.to === "/rights-management")).toBe(true);
  });

  it("collapses Management/Reports/Settings to flat links for agents (no single-item dropdowns)", () => {
    for (const id of ["management", "reports", "settings"]) {
      expect(
        agent.some((e) => e.kind === "group" && e.id === id),
        `agent should not see group ${id} as an expandable dropdown`,
      ).toBe(false);
    }
    // The single visible child shows up as a flat link using the group label.
    expect(
      agent.some((e) => e.kind === "link" && e.label === "Management" && e.to === "/retest"),
    ).toBe(true);
    expect(
      agent.some(
        (e) => e.kind === "link" && e.label === "Reports" && e.to === "/my-reported-errors",
      ),
    ).toBe(true);
    expect(
      agent.some((e) => e.kind === "link" && e.label === "Settings" && e.to === "/profile"),
    ).toBe(true);
  });

  it("hides every admin-only entry from agents", () => {
    const adminOnlyRoutes = [
      "/rights-management",
      "/agents",
      "/permission-audit",
      "/audit-log",
      "/auth-events",
      "/reports",
      "/reports/performance",
      "/reports/user",
      "/reports/activity",
      "/reports/analytics",
      "/reports/audit",
      "/reports/scheduled",
      "/reports/export-center",
    ];
    const flat = agent.flatMap((e) =>
      e.kind === "link" ? [e.to] : e.items.map((i) => i.to),
    );
    for (const to of adminOnlyRoutes) {
      expect(flat, `agent should not see ${to}`).not.toContain(to);
    }
  });

  it("produces no duplicate routes for either role", () => {
    for (const list of [admin, agent]) {
      const tos = list.flatMap((e) =>
        e.kind === "link" ? [e.to] : e.items.map((i) => i.to),
      );
      expect(new Set(tos).size).toBe(tos.length);
    }
  });
});