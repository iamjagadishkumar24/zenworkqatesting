import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { RetestAssignment } from "@/lib/qa/retest";

// ---- Mutable mock state -------------------------------------------------
let items: RetestAssignment[] = [];
let currentUser: { id: string; role: "agent" | "admin"; name: string } | null = {
  id: "agent-1",
  role: "agent",
  name: "Agent One",
};

vi.mock("@/lib/qa/retest", async () => {
  const actual = await vi.importActual<typeof import("@/lib/qa/retest")>("@/lib/qa/retest");
  return { ...actual, useRetests: () => ({ items }) };
});
vi.mock("@/lib/qa/environment", () => ({ useEnvironment: () => ({ env: null }) }));
vi.mock("@/lib/qa/store", () => ({ useQA: () => ({ currentUser }) }));
// Avoid TanStack router context for the popover Link children.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

import { DeadlineCountdown } from "./DeadlineCountdown";

function makeAssignment(over: Partial<RetestAssignment> & { id: string }): RetestAssignment {
  return {
    title: `Task ${over.id}`,
    module: "Forms",
    status: "Pending",
    priority: "High",
    assigned_agent_id: "agent-1",
    assigned_agent_name: "Agent One",
    environment: "Stage",
    tax_year: null,
    deadline_at: new Date(Date.now() + 3_600_000).toISOString(),
    forms: [],
    ...over,
  } as RetestAssignment;
}

beforeEach(() => {
  cleanup();
  items = [];
  currentUser = { id: "agent-1", role: "agent", name: "Agent One" };
});

describe("DeadlineCountdown — hook order stability", () => {
  it("renders the empty state without throwing when an agent has no active deadlines", () => {
    expect(() => render(<DeadlineCountdown />)).not.toThrow();
    expect(screen.getByLabelText(/no active deadlines/i)).toBeTruthy();
  });

  it("renders the popover trigger when an agent has one active deadline", () => {
    items = [makeAssignment({ id: "t-1" })];
    expect(() => render(<DeadlineCountdown />)).not.toThrow();
    expect(screen.getByRole("button", { name: /active deadline/i })).toBeTruthy();
  });

  it("does not crash transitioning empty → non-empty (the React #310 regression)", () => {
    const { rerender } = render(<DeadlineCountdown />);
    expect(screen.getByLabelText(/no active deadlines/i)).toBeTruthy();
    items = [makeAssignment({ id: "t-1" })];
    expect(() => rerender(<DeadlineCountdown />)).not.toThrow();
    expect(screen.getByRole("button", { name: /active deadline/i })).toBeTruthy();
  });

  it("does not crash transitioning non-empty → empty", () => {
    items = [makeAssignment({ id: "t-1" })];
    const { rerender } = render(<DeadlineCountdown />);
    expect(screen.getByRole("button", { name: /active deadline/i })).toBeTruthy();
    items = [];
    expect(() => rerender(<DeadlineCountdown />)).not.toThrow();
    expect(screen.getByLabelText(/no active deadlines/i)).toBeTruthy();
  });

  it("returns null for non-agent users (and renders nothing) without hook errors", () => {
    currentUser = { id: "admin-1", role: "admin", name: "Admin" };
    const { container } = render(<DeadlineCountdown />);
    expect(container.textContent).toBe("");
  });

  it("survives a role transition agent → admin → agent", () => {
    items = [makeAssignment({ id: "t-1" })];
    const { rerender, container } = render(<DeadlineCountdown />);
    expect(screen.getByRole("button", { name: /active deadline/i })).toBeTruthy();
    currentUser = { id: "admin-1", role: "admin", name: "Admin" };
    expect(() => rerender(<DeadlineCountdown />)).not.toThrow();
    expect(container.textContent).toBe("");
    currentUser = { id: "agent-1", role: "agent", name: "Agent One" };
    expect(() => rerender(<DeadlineCountdown />)).not.toThrow();
    expect(screen.getByRole("button", { name: /active deadline/i })).toBeTruthy();
  });
});