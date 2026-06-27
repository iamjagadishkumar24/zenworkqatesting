import { test, expect } from "@playwright/test";
import { loginAgent } from "./agent-theme-helpers";

const ADMIN = {
  email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
};

async function loginAdmin(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(ADMIN.email!);
  await page.getByLabel(/password/i).fill(ADMIN.password!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

test.describe("/settings redirect", () => {
  test.skip(
    !process.env.PLAYWRIGHT_AGENT_EMAIL || !process.env.PLAYWRIGHT_ADMIN_EMAIL,
    "Requires PLAYWRIGHT_*_EMAIL/PASSWORD env vars",
  );

  test("agent: /settings → /profile", async ({ page }) => {
    await loginAgent(page);
    await page.goto("/settings");
    await page.waitForURL(/\/profile$/);
    expect(new URL(page.url()).pathname).toBe("/profile");
    await expect(page.getByRole("heading", { name: /profile.*settings/i })).toBeVisible();
  });

  test("admin: /settings → /profile", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/settings");
    await page.waitForURL(/\/profile$/);
    expect(new URL(page.url()).pathname).toBe("/profile");
    await expect(page.getByRole("heading", { name: /profile.*settings/i })).toBeVisible();
  });
});

test.describe("Profile > Settings save / reset / validation", () => {
  test.skip(
    !process.env.PLAYWRIGHT_AGENT_EMAIL || !process.env.PLAYWRIGHT_ADMIN_EMAIL,
    "Requires PLAYWRIGHT_*_EMAIL/PASSWORD env vars",
  );

  for (const role of ["agent", "admin"] as const) {
    test(`${role}: change accent saves and persists across reload`, async ({ page }) => {
      if (role === "agent") await loginAgent(page);
      else await loginAdmin(page);

      await page.goto("/profile");
      await expect(page.getByRole("heading", { name: /profile.*settings/i })).toBeVisible();

      // Change accent
      await page.getByRole("radio", { name: /green theme/i }).click();
      await page.waitForFunction(() => document.documentElement.dataset.accent === "green", {
        timeout: 5000,
      });

      // Reload and verify persistence
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.accent === "green", {
        timeout: 5000,
      });

      // Reset to blue
      await page.getByRole("radio", { name: /blue theme/i }).click();
      await page.waitForFunction(() => document.documentElement.dataset.accent === "blue", {
        timeout: 5000,
      });
    });

    test(`${role}: invalid page size falls back to safe default`, async ({ page }) => {
      if (role === "agent") await loginAgent(page);
      else await loginAdmin(page);

      await page.goto("/profile");
      // Seed an invalid stored preference, reload, and confirm UI doesn't crash.
      await page.evaluate(() => {
        try {
          localStorage.setItem("qa.auditLogPageSize", "not-a-number");
        } catch {
          /* ignore */
        }
      });
      await page.reload();
      await expect(page.getByRole("heading", { name: /profile.*settings/i })).toBeVisible();
    });
  }
});
