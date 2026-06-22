import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";

const setEnvMock = vi.fn();
const navigateMock = vi.fn();
let prefsValue: { defaultLanding?: string } = { defaultLanding: "/dashboard" };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (cfg: any) => cfg,
  useNavigate: () => navigateMock,
}));
vi.mock("@/lib/qa/environment", () => ({
  useEnvironment: () => ({ setEnv: setEnvMock }),
}));
vi.mock("@/lib/qa/prefs", () => ({
  usePrefs: () => ({ prefs: prefsValue }),
}));

import { Route } from "./_app.select-environment";
const SelectEnvironment = (Route as any).options?.component ?? (Route as any).component;

describe("SelectEnvironment route", () => {
  beforeEach(() => {
    setEnvMock.mockClear();
    navigateMock.mockClear();
    prefsValue = { defaultLanding: "/dashboard" };
  });

  it("sets Production and navigates to preferred landing when card clicked", () => {
    render(<SelectEnvironment />);
    fireEvent.click(screen.getByText("Production").closest("button")!);
    expect(setEnvMock).toHaveBeenCalledWith("Production");
    expect(navigateMock).toHaveBeenCalledWith({ to: "/dashboard" });
  });

  it("sets Stage when its card is clicked", () => {
    render(<SelectEnvironment />);
    fireEvent.click(screen.getByText("Stage").closest("button")!);
    expect(setEnvMock).toHaveBeenCalledWith("Stage");
  });

  it("falls back to /dashboard when defaultLanding is missing", () => {
    prefsValue = {};
    render(<SelectEnvironment />);
    fireEvent.click(screen.getByRole("button", { name: /continue with production/i }));
    expect(setEnvMock).toHaveBeenCalledWith("Production");
    expect(navigateMock).toHaveBeenCalledWith({ to: "/dashboard" });
  });
});