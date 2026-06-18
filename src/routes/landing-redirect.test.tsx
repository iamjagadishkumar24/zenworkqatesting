import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { canAccessRoute } from "@/lib/qa/scope";

const navigateSpy = vi.fn(({ to }: { to: string }) => <div data-testid="nav">{to}</div>);

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (cfg: any) => cfg,
  Navigate: (props: any) => navigateSpy(props),
}));

let mockUser: { name: string; role: "admin" | "agent" } | null = null;
vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({ currentUser: mockUser }),
}));

import { Route as IndexRoute } from "./index";

const Index = (IndexRoute as any).options?.component ?? (IndexRoute as any).component;

describe("landing redirect + session persistence", () => {
  it("redirects unauthenticated visitor to /login", () => {
    mockUser = null;
    navigateSpy.mockClear();
    render(<Index />);
    expect(navigateSpy).toHaveBeenCalledWith(expect.objectContaining({ to: "/login", replace: true }));
  });

  it("redirects authenticated Admin to /dashboard (session restored)", () => {
    mockUser = { name: "Admin User", role: "admin" };
    navigateSpy.mockClear();
    render(<Index />);
    expect(navigateSpy).toHaveBeenCalledWith(expect.objectContaining({ to: "/dashboard", replace: true }));
  });

  it("redirects authenticated QA Agent to /dashboard (session restored)", () => {
    mockUser = { name: "Agent A", role: "agent" };
    navigateSpy.mockClear();
    render(<Index />);
    expect(navigateSpy).toHaveBeenCalledWith(expect.objectContaining({ to: "/dashboard", replace: true }));
  });
});

describe("role-based landing access", () => {
  const agentAllowed = ["/dashboard", "/my-reported-errors", "/my-errors", "/retest", "/notifications", "/settings"];
  const adminOnly = ["/agents", "/audit-log", "/reports"];

  it("Agent can reach their own allowed pages", () => {
    for (const p of agentAllowed) expect(canAccessRoute("agent", p)).toBe(true);
  });

  it("Agent is blocked from admin-only pages", () => {
    for (const p of adminOnly) expect(canAccessRoute("agent", p)).toBe(false);
  });

  it("Admin can reach every page", () => {
    for (const p of [...agentAllowed, ...adminOnly]) expect(canAccessRoute("admin", p)).toBe(true);
  });

  it("Unauthenticated has no route access", () => {
    expect(canAccessRoute(null, "/dashboard")).toBe(false);
  });
});