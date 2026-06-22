import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// --- Mocks must be hoisted before importing the route module ---
const loginMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (cfg: any) => cfg,
  useNavigate: () => vi.fn(),
  Navigate: () => null,
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: any) => fn,
}));

vi.mock("@/lib/qa/admin.functions", () => ({
  resetSampleAdmin: vi.fn(async () => ({ email: "admin@qaportal.app", password: "Admin@12345" })),
  sampleAdminStatus: vi.fn(async () => ({ exists: true, isAdmin: true, active: true })),
  accountStatus: vi.fn(async () => ({ exists: false })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { resetPasswordForEmail: vi.fn(async () => ({ error: null })) } },
}));

vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({
    currentUser: null,
    users: [],
    login: loginMock,
    signup: vi.fn(),
  }),
}));

vi.mock("@/lib/qa/environment", () => ({
  useEnvironment: () => ({ env: null, ready: true, setEnv: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { LoginPage, LoginErrorFallback } from "./login";

describe("LoginErrorFallback", () => {
  it("renders fallback UI with the error message", () => {
    render(<LoginErrorFallback error={new Error("boom")} reset={() => {}} />);
    expect(
      screen.getByRole("heading", { name: /sign in is temporarily unavailable/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("calls reset when Try again is clicked", () => {
    const reset = vi.fn();
    render(<LoginErrorFallback error={new Error("x")} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("LoginPage failed login", () => {
  it("moves focus to the alert hint after a failed login attempt", async () => {
    loginMock.mockResolvedValueOnce({ ok: false, error: "Invalid credentials" });

    render(<LoginPage />);

    const email = document.getElementById("email") as HTMLInputElement;
    const pwd = document.getElementById("pwd") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "user@x.com" } });
    fireEvent.change(pwd, { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert).toBeInTheDocument();

    await waitFor(() => {
      expect(document.activeElement).toBe(alert);
    });
  });
});

describe("LoginPage validation and success", () => {
  it("blocks submit and warns when email is missing", async () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/enter your email/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("warns on malformed email and does not call login", async () => {
    render(<LoginPage />);
    const email = document.getElementById("email") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "not-an-email" } });
    const pwd = document.getElementById("pwd") as HTMLInputElement;
    fireEvent.change(pwd, { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/invalid email format/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("warns when password is missing", async () => {
    render(<LoginPage />);
    const email = document.getElementById("email") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "ok@x.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText(/enter your password/i)).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("persists email on success when remember is checked", async () => {
    loginMock.mockResolvedValueOnce({ ok: true });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<LoginPage />);
    const email = document.getElementById("email") as HTMLInputElement;
    const pwd = document.getElementById("pwd") as HTMLInputElement;
    fireEvent.change(email, { target: { value: "User@X.com" } });
    fireEvent.change(pwd, { target: { value: "ok-pass" } });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith("user@x.com", "ok-pass"),
    );
    await waitFor(() =>
      expect(setItem).toHaveBeenCalledWith("zenwork.rememberEmail", "user@x.com"),
    );
    setItem.mockRestore();
  });
});
