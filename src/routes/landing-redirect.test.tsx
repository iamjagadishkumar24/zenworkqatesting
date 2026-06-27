import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { canAccessRoute } from "@/lib/qa/scope";

type NavigateProps = { to: string; replace?: boolean };
const navigateSpy = vi.fn((props: NavigateProps) => <div data-testid="nav">{props.to}</div>);

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (cfg: unknown) => cfg,
  Navigate: (props: NavigateProps) => navigateSpy(props),
}));

let mockUser: { name: string; role: "admin" | "agent" } | null = null;
vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({ currentUser: mockUser }),
}));

import { Route as IndexRoute } from "./index";

type RouteWithComponent = { options?: { component?: ComponentType }; component?: ComponentType };
const routeRef = IndexRoute as unknown as RouteWithComponent;
const Index = (routeRef.options?.component ?? routeRef.component) as ComponentType;

describe("landing redirect + session persistence", () => {
  it("redirects unauthenticated visitor to /login", () => {
    mockUser = null;
    navigateSpy.mockClear();
    render(<Index />);
    expect(navigateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/login", replace: true }),
    );
  });

  it("redirects authenticated Admin to /dashboard (session restored)", () => {
    mockUser = { name: "Admin User", role: "admin" };
    navigateSpy.mockClear();
    render(<Index />);
    expect(navigateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/dashboard", replace: true }),
    );
  });

  it("redirects authenticated QA Agent to /dashboard (session restored)", () => {
    mockUser = { name: "Agent A", role: "agent" };
    navigateSpy.mockClear();
    render(<Index />);
    expect(navigateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/dashboard", replace: true }),
    );
  });
});

describe("role-based landing access", () => {
  const agentAllowed = [
    "/dashboard",
    "/my-reported-errors",
    "/my-errors",
    "/retest",
    "/notifications",
    "/profile",
  ];
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
