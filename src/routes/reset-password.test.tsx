import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(async () => ({ error: null as any })),
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
  createFileRoute: () => (cfg: any) => cfg,
  useNavigate: () => h.navigateMock,
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => fn,
}));
vi.mock("@/lib/qa/admin.functions", () => ({
  accountStatus: (args: any) => h.accountStatusMock(args),
}));
vi.mock("@/integrations/supabase/client", () => {
  const supabase: any = {
    auth: {
      getSession: (...a: any[]) => (h.getSession as any)(...a),
      updateUser: (...a: any[]) => (h.updateUser as any)(...a),
      signOut: (...a: any[]) => (h.signOut as any)(...a),
    },
  };
  return { supabase };
});
vi.mock("sonner", () => ({
  toast: {
    error: (...a: any[]) => h.toastError(...a),
    success: (...a: any[]) => h.toastSuccess(...a),
  },
}));

import { Route } from "./reset-password";
const ResetPasswordPage = (Route as any).options?.component ?? (Route as any).component;

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
