import { test, expect, type Page } from "@playwright/test";

const AGENT = {
  email: process.env.PLAYWRIGHT_AGENT_EMAIL,
  password: process.env.PLAYWRIGHT_AGENT_PASSWORD,
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

test.describe("Agent theme color persists across refresh and dashboard", () => {
  test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

  test("changing accent in Settings applies on dashboard after refresh", async ({ page }) => {
    await login(page, AGENT.email!, AGENT.password!);
    await page.goto("/settings");

    // Pick a color that's clearly different from the default ("blue").
    await page.getByRole("radio", { name: /green theme/i }).click();
    // Allow the optimistic localStorage write + server upsert to flush.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.accent))
      .toBe("green");

    // Hard reload to prove it persisted (server upsert + hydrate).
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.accent), {
        timeout: 10_000,
      })
      .toBe("green");
  });
});