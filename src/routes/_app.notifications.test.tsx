import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";
import type { ComponentType } from "react";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string;
  defectId?: string;
  environment: string;
  read: boolean;
  createdAt: string;
};

const markReadMock = vi.fn(async () => {});
const navigateMock = vi.fn();
let envValue: string | null = "Production";
let notifs: Notif[] = [];

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (cfg: unknown) => cfg,
  useNavigate: () => navigateMock,
}));
vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({ notifications: notifs, markNotificationsRead: markReadMock }),
}));
vi.mock("@/lib/qa/environment", () => ({
  useEnvironment: () => ({ env: envValue }),
}));

import { Route } from "./_app.notifications";
type RouteWithComponent = { options?: { component?: ComponentType }; component?: ComponentType };
const routeRef = Route as unknown as RouteWithComponent;
const NotificationsPage = (routeRef.options?.component ?? routeRef.component) as ComponentType;

const mkN = (over: Partial<Notif> = {}): Notif => ({
  id: "n" + Math.random(),
  type: "defect_update",
  title: "T",
  body: "B",
  defectId: "D-1",
  environment: "Production",
  read: false,
  createdAt: new Date().toISOString(),
  ...over,
});

describe("Notifications route", () => {
  beforeEach(() => {
    markReadMock.mockClear();
    navigateMock.mockClear();
    envValue = "Production";
    notifs = [];
    vi.useFakeTimers();
  });

  it("shows empty state when no notifications", () => {
    vi.useRealTimers();
    render(<NotificationsPage />);
    expect(screen.getByText(/you're all caught up/i)).toBeInTheDocument();
  });

  it("filters out notifications from other environments", () => {
    vi.useRealTimers();
    notifs = [mkN({ environment: "Stage", title: "Stage one" }), mkN({ title: "Prod one" })];
    render(<NotificationsPage />);
    expect(screen.getByText("Prod one")).toBeInTheDocument();
    expect(screen.queryByText("Stage one")).not.toBeInTheDocument();
  });

  it("filter buttons restrict task vs error notifications", () => {
    vi.useRealTimers();
    notifs = [
      mkN({ type: "retest_assigned", title: "Retest A" }),
      mkN({ type: "defect_update", title: "Defect B" }),
    ];
    render(<NotificationsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(screen.getByText("Retest A")).toBeInTheDocument();
    expect(screen.queryByText("Defect B")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Error updates" }));
    expect(screen.getByText("Defect B")).toBeInTheDocument();
    expect(screen.queryByText("Retest A")).not.toBeInTheDocument();
  });

  it("auto marks unread notifications read after delay", async () => {
    notifs = [mkN({ id: "a", read: false }), mkN({ id: "b", read: true })];
    render(<NotificationsPage />);
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(markReadMock).toHaveBeenCalledWith(["a"]);
  });

  it("clicking notification navigates via routeForNotification", () => {
    vi.useRealTimers();
    notifs = [mkN({ id: "x", type: "defect_update", defectId: "D-42", title: "Click me" })];
    render(<NotificationsPage />);
    fireEvent.click(screen.getByText("Click me"));
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "/my-reported-errors" }),
    );
  });
});
