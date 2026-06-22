import { test, expect } from "@playwright/test";
import { AGENT, loginAgent, pickAccent, readTokens } from "./agent-theme-helpers";

const SWATCHES: { label: string; token: string }[] = [
  { label: "Light", token: "light" },
  { label: "Blue", token: "blue" },
  { label: "Green", token: "green" },
  { label: "Emerald", token: "emerald" },
  { label: "Teal", token: "teal" },
  { label: "Purple", token: "purple" },
  { label: "Violet", token: "violet" },
  { label: "Pink", token: "pink" },
  { label: "Rose", token: "rose" },
  { label: "Orange", token: "orange" },
  { label: "Grey", token: "grey" },
];

test.describe("Agent smoke: every accent swatch updates the UI", () => {
  test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

  test("each swatch sets data-accent and a non-empty primary token", async ({ page }) => {
    await loginAgent(page);
    // Sanity: main UI loads.
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /dashboard/i }).first()).toBeVisible();

    const seenPrimaries = new Set<string>();
    for (const s of SWATCHES) {
      await pickAccent(page, s.label);
      const tokens = await readTokens(page);
      expect(tokens.accent, `data-accent for ${s.label}`).toBe(s.token);
      expect(tokens.primary.length, `primary set for ${s.label}`).toBeGreaterThan(0);
      expect(tokens.gradient).toMatch(/gradient|linear-/i);
      seenPrimaries.add(tokens.primary);
    }
    // Most swatches should resolve to a distinct primary. Allow a small
    // overlap budget for browser color rounding.
    expect(seenPrimaries.size).toBeGreaterThanOrEqual(SWATCHES.length - 2);
  });
});