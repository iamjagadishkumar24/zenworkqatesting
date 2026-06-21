import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const HOUR = 3_600_000;
const NOW = new Date("2026-01-01T00:00:00Z").getTime();
const at = (ms: number) => new Date(NOW + ms).toISOString();

const mockItems = vi.fn(() => [] as unknown[]);

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...(rest as object)}>{children}</a>,
}));
vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({ currentUser: { id: "agent-1", role: "agent", name: "A" } }),
}));
vi.mock("@/lib/qa/environment", () => ({ useEnvironment: () => ({ env: null }) }));
vi.mock("@/lib/qa/retest", () => ({ useRetests: () => ({ items: mockItems() }) }));

import { DeadlineCountdown } from "./DeadlineCountdown";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  mockItems.mockReset();
  mockItems.mockReturnValue([]);
});

const task = (id: string, hours: number) => ({
  id,
  title: `Task ${id}`,
  assigned_agent_id: "agent-1",
  status: "Open",
  priority: "Medium",
  deadline_at: at(hours * HOUR),
  environment: "Production",
});

describe("DeadlineCountdown compact widget", () => {
  it("shows 'No Active Deadlines' when none are assigned", () => {
    mockItems.mockReturnValue([]);
    render(<DeadlineCountdown />);
    expect(screen.getByLabelText(/no active deadlines/i)).toBeInTheDocument();
  });

  it("renders single-task format with time remaining", () => {
    mockItems.mockReturnValue([task("t1", 5)]);
    render(<DeadlineCountdown />);
    expect(screen.getByRole("button")).toHaveTextContent(/05h 00m Left/);
  });

  it("renders multi-task format with count and nearest deadline", () => {
    mockItems.mockReturnValue([task("t1", 5), task("t2", 12), task("t3", 30)]);
    render(<DeadlineCountdown />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent(/3 Due/);
    expect(btn).toHaveTextContent(/05h 00m/);
  });
});