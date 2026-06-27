import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";

const h = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(async () => ({ error: null as { message: string } | null })),
  signOut: vi.fn(async () => ({})),
  accountStatusMock: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));
const {
  navigateMock,
  getSession,
  updateUser,
  signOut,
  accountStatusMock,
  toastError,
  toastSuccess,
} = h;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (cfg: unknown) => cfg,
  useNavigate: () => h.navigateMock,
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: <F,>(fn: F): F => fn,
}));
vi.mock("@/lib/qa/admin.functions", () => ({
  accountStatus: (args: unknown) => h.accountStatusMock(args),
}));
vi.mock("@/integrations/supabase/client", () => {
  const supabase = {
    auth: {
      getSession: (...a: unknown[]) => (h.getSession as (...x: unknown[]) => unknown)(...a),
      updateUser: (...a: unknown[]) => (h.updateUser as (...x: unknown[]) => unknown)(...a),
      signOut: (...a: unknown[]) => (h.signOut as (...x: unknown[]) => unknown)(...a),
    },
  };
  return { supabase };
});
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => h.toastError(...a),
    success: (...a: unknown[]) => h.toastSuccess(...a),
  },
}));

import { Route } from "./reset-password";
type RouteWithComponent = { options?: { component?: ComponentType }; component?: ComponentType };
const routeRef = Route as unknown as RouteWithComponent;
const ResetPasswordPage = (routeRef.options?.component ?? routeRef.component) as ComponentType;

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    updateUser.mockClear();
    signOut.mockClear();
    accountStatusMock.mockReset();
    toastError.mockClear();
    toastSuccess.mockClear();
    getSession.mockReset();
  });

  it("shows no-session banner when there's no recovery session", async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });
    render(<ResetPasswordPage />);
    expect(await screen.findByText(/no active reset session/i)).toBeInTheDocument();
  });

  it("shows inactive banner when account is deactivated", async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { user: { email: "a@x.com" } } },
    });
    accountStatusMock.mockResolvedValueOnce({
      exists: true,
      active: false,
      hasRole: true,
      name: "Alice",
    });
    render(<ResetPasswordPage />);
    expect(await screen.findByText(/account inactive/i)).toBeInTheDocument();
  });

  it("validates password length and mismatch before calling supabase", async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { user: { email: "a@x.com" } } },
    });
    accountStatusMock.mockResolvedValueOnce({
      exists: true,
      active: true,
      hasRole: true,
      isAdmin: true,
      name: "A",
    });
    render(<ResetPasswordPage />);
    await screen.findByText(/resetting password for/i);
    const np = document.getElementById("np") as HTMLInputElement;
    const cp = document.getElementById("cp") as HTMLInputElement;
    fireEvent.change(np, { target: { value: "short" } });
    fireEvent.change(cp, { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/at least 8/i));

    fireEvent.change(np, { target: { value: "longenough1" } });
    fireEvent.change(cp, { target: { value: "different1" } });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/do not match/i));
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates password, signs out and navigates to login on success", async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { user: { email: "a@x.com" } } },
    });
    accountStatusMock.mockResolvedValueOnce({
      exists: true,
      active: true,
      hasRole: true,
      isAdmin: false,
      name: "A",
    });
    render(<ResetPasswordPage />);
    await screen.findByText(/resetting password for/i);
    const np = document.getElementById("np") as HTMLInputElement;
    const cp = document.getElementById("cp") as HTMLInputElement;
    fireEvent.change(np, { target: { value: "longenough1" } });
    fireEvent.change(cp, { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("button", { name: /update password/i }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "longenough1" }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith({ to: "/login" });
    expect(toastSuccess).toHaveBeenCalled();
  });
});
