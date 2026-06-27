import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { axe } from "vitest-axe";
import { Sun, Moon, Monitor } from "lucide-react";

type Theme = "light" | "dark" | "system";
const ORDER: Theme[] = ["light", "dark", "system"];

function ThemeToggleHarness({ initial = "light" as Theme }: { initial?: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const idx = ORDER.indexOf(theme);
  const next = ORDER[(idx + 1) % ORDER.length];
  const Icon = theme === "dark" ? Moon : theme === "system" ? Monitor : Sun;
  const label = theme === "dark" ? "Dark" : theme === "system" ? "System" : "Light";
  const pressed: "true" | "false" | "mixed" =
    theme === "dark" ? "true" : theme === "system" ? "mixed" : "false";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-pressed={pressed}
      data-theme-toggle
      data-state={theme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`Theme: ${label}. Click to switch to ${next}.`}
      title={`Theme: ${label} — click for ${next}`}
    >
      <Icon aria-hidden="true" />
      <span className="sr-only">Current theme: {label}</span>
    </button>
  );
}

describe("Theme toggle accessibility", () => {
  it("renders as a button with discernible name and aria-pressed=false in light mode", () => {
    render(<ThemeToggleHarness initial="light" />);
    const btn = screen.getByRole("button", { name: /theme: light/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    expect(btn.tagName).toBe("BUTTON");
  });

  it("aria-pressed=true in dark mode", () => {
    render(<ThemeToggleHarness initial="dark" />);
    expect(screen.getByRole("button", { name: /theme: dark/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("aria-pressed=mixed in system mode", () => {
    render(<ThemeToggleHarness initial="system" />);
    expect(screen.getByRole("button", { name: /theme: system/i })).toHaveAttribute(
      "aria-pressed",
      "mixed",
    );
  });

  it("cycles theme on Enter and Space via keyboard", async () => {
    const user = userEvent.setup();
    render(<ThemeToggleHarness initial="light" />);
    const btn = screen.getByRole("button");
    btn.focus();
    expect(btn).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "dark");

    await user.keyboard("[Space]");
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "system");

    await user.keyboard("{Enter}");
    expect(screen.getByRole("button")).toHaveAttribute("data-state", "light");
  });

  it("has visible focus-ring utility classes", () => {
    render(<ThemeToggleHarness />);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/focus-visible:ring-2/);
    expect(btn.className).toMatch(/focus-visible:ring-ring/);
  });

  it.each<Theme>(["light", "dark", "system"])("has no axe violations (%s)", async (t) => {
    const { container } = render(<ThemeToggleHarness initial={t} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});