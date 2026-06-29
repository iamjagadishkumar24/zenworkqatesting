import { test, expect } from "@playwright/test";
import { AGENT, loginAgent, pickAccent, readTokens } from "./agent-theme-helpers";

const SWATCHES = [
  { label: "Light", token: "light" },
  { label: "Blue", token: "blue" },
  { label: "Green", token: "green" },
  { label: "Teal", token: "teal" },
  { label: "Purple", token: "purple" },
  { label: "Pink", token: "pink" },
  { label: "Orange", token: "orange" },
  { label: "Grey", token: "grey" },
] as const;

test.describe("Theme Settings: Compare All Themes removed", () => {
  test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

  test("Compare All Themes UI is gone but swatches still apply instantly", async ({ page }) => {
    await loginAgent(page);
    await page.goto("/profile", { waitUntil: "networkidle" });

    // The Compare All Themes block, button, and preview grid must not exist
    // anywhere on the Theme Settings page.
    await expect(page.getByRole("button", { name: /compare all themes/i })).toHaveCount(0);
    await expect(page.getByText(/compare all themes/i)).toHaveCount(0);
    await expect(page.locator('[data-testid="accent-preview-grid"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="accent-preview-tile"]')).toHaveCount(0);

    // The radiogroup of accent swatches must still be present and functional.
    const group = page.getByRole("radiogroup", { name: /theme color/i });
    await expect(group).toBeVisible();
    for (const s of SWATCHES) {
      await expect(
        group.getByRole("radio", { name: new RegExp(`${s.label} theme`, "i") }),
      ).toBeVisible();
    }

    // Each swatch applies instantly and is reflected in the live tokens
    // on the current page (no save / reload required).
    for (const s of SWATCHES) {
      await pickAccent(page, s.label);
      const tokens = await readTokens(page);
      expect(tokens.accent, `data-accent for ${s.label}`).toBe(s.token);
      expect(tokens.primary.length, `primary token for ${s.label}`).toBeGreaterThan(0);
    }

    // And the active accent persists into another route without re-applying.
    await pickAccent(page, "Teal");
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const dashTokens = await readTokens(page);
    expect(dashTokens.accent).toBe("teal");
    expect(dashTokens.primary.length).toBeGreaterThan(0);
  });
});