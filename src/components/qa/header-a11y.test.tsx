import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Bell, Sun } from "lucide-react";

// Mock TanStack router hooks used by NotificationsBell
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

// Mock QA store + environment used by NotificationsBell
vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({
    notifications: [
      {
        id: "n1",
        title: "New defect assigned",
        body: "Defect #42 is assigned to you",
        createdAt: new Date().toISOString(),
        read: false,
      },
      {
        id: "n2",
        title: "Retest requested",
        body: "Defect #17 needs retest",
        createdAt: new Date().toISOString(),
        read: true,
      },
    ],
    currentUser: { id: "u1", name: "Jane Doe", email: "jane@example.com", role: "admin" },
    markNotificationsRead: vi.fn().mockResolvedValue(undefined),
  }),
}));
vi.mock("@/lib/qa/environment", () => ({ useEnvironment: () => ({ env: "Production" }) }));
vi.mock("@/lib/qa/notificationRouting", () => ({
  routeForNotification: () => ({ to: "/dashboard", search: {} }),
}));

import { NotificationsBell } from "./NotificationsBell";

function HeaderSkeleton() {
  // Mirrors the AppShell account-menu loading skeleton
  return (
    <header>
      <button
        type="button"
        aria-busy="true"
        aria-haspopup="menu"
        aria-label="Loading account, please wait"
      >
        <span role="status" aria-busy="true" aria-live="polite" aria-label="Loading account">
          <span aria-hidden="true" className="inline-block h-4 w-16 rounded bg-muted" />
          <span className="sr-only">Loading your account…</span>
        </span>
      </button>
    </header>
  );
}

function ThemeToggle() {
  // Mirrors the AppShell theme toggle button
  return (
    <button type="button" aria-label="Theme: Light. Click to switch to dark.">
      <Sun aria-hidden="true" />
    </button>
  );
}

describe("Header a11y", () => {
  it("header skeleton has no axe violations", async () => {
    const { container } = render(<HeaderSkeleton />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("theme toggle has no axe violations", async () => {
    const { container } = render(<ThemeToggle />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("notifications bell has no axe violations (closed & open) and announces state", async () => {
    const user = userEvent.setup();
    const { container } = render(<NotificationsBell />);

    // Closed state passes axe
    expect(await axe(container)).toHaveNoViolations();

    const trigger = screen.getByRole("button", { name: /notifications/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    const liveRegion = screen.getByTestId("notifications-live-region");
    expect(liveRegion).toHaveAttribute("aria-live", "polite");

    // Open the dropdown — Radix sets aria-expanded and traps focus
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(liveRegion.textContent).toMatch(/opened/i);

    // Esc closes
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(liveRegion.textContent).toMatch(/closed/i);

    expect(await axe(container)).toHaveNoViolations();
  });

  it("bell icon trigger has a discernible name", () => {
    render(
      <button aria-label="Notifications, 3 unread">
        <Bell aria-hidden="true" />
      </button>,
    );
    expect(screen.getByRole("button", { name: /notifications/i })).toBeInTheDocument();
  });
});