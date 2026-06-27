import { test, expect } from "@playwright/test";
import { AGENT, loginAgent, pickAccent, readTokens, logout } from "./agent-theme-helpers";

test.describe("Agent accent persists across logout/login", () => {
  test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

  test("picking Purple survives a sign-out + sign-in cycle", async ({ page }) => {
    await loginAgent(page);
    await pickAccent(page, "Purple");
    const before = await readTokens(page);
    expect(before.accent).toBe("purple");

    // Sign out and clear local cache so the next session must rehydrate
    // the accent from the backend, not from localStorage.
    await logout(page);
    await page.context().clearCookies();
    await page.goto("/auth", { waitUntil: "networkidle" });

    await loginAgent(page);
    for (const path of ["/dashboard", "/defects", "/reports"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.accent), {
          timeout: 10_000,
        })
        .toBe("purple");
      const after = await readTokens(page);
      expect(after.primary).toBe(before.primary);
      expect(after.ring).toBe(before.ring);
      expect(after.sidebar).toBe(before.sidebar);
      expect(after.gradient).toBe(before.gradient);
    }
  });
});
