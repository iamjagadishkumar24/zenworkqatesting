import { test, expect } from "@playwright/test";

test("unauthenticated /settings redirects to login, not /profile", async ({ page }) => {
  // Ensure no stale session
  await page.goto("/login");
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  await page.goto("/settings");
  await page.waitForURL(/\/login(\?|$)/, { timeout: 10_000 });

  const pathname = new URL(page.url()).pathname;
  expect(pathname).toBe("/login");
  expect(pathname).not.toBe("/profile");

  // Login form should be visible — no protected Profile content leaked.
  await expect(page.getByLabel(/email/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /profile.*settings/i })).toHaveCount(0);
});