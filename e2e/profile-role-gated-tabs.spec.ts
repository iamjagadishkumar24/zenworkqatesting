import { test, expect, type Page } from "@playwright/test";
import { loginAgent } from "./agent-theme-helpers";

const ADMIN = {
  email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
};

async function loginAdmin(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(ADMIN.email!);
  await page.getByLabel(/password/i).fill(ADMIN.password!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

// Tabs only Admins should be able to open.
const ADMIN_ONLY_TABS = [
  "team",
  "modules",
  "forms",
  "taxonomy",
  "reports",
  "data",
  "audit",
  "runtime",
] as const;

// Tabs available to both roles.
const SHARED_TABS = ["profile", "notifications", "theme", "dashboard"] as const;

test.describe("Profile role-gated tabs", () => {
  test.skip(
    !process.env.PLAYWRIGHT_AGENT_EMAIL || !process.env.PLAYWRIGHT_ADMIN_EMAIL,
    "Requires PLAYWRIGHT_*_EMAIL/PASSWORD env vars",
  );

  test("agent: admin-only tabs are disabled and cannot be activated", async ({ page }) => {
    await loginAgent(page);
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: /profile.*settings/i })).toBeVisible();

    for (const value of ADMIN_ONLY_TABS) {
      const tab = page.locator(`[role="tab"][value="${value}"]`).first();
      await expect(tab).toBeVisible();
      // The TabsTrigger is rendered disabled for non-admins.
      await expect(tab).toBeDisabled();
      // Attempt to activate via click — should remain inactive.
      await tab.click({ force: true }).catch(() => {});
      await expect(tab).not.toHaveAttribute("data-state", "active");
    }

    // Shared tabs must remain reachable for agents.
    for (const value of SHARED_TABS) {
      const tab = page.locator(`[role="tab"][value="${value}"]`).first();
      await expect(tab).toBeEnabled();
    }
  });

  test("admin: all admin-only tabs are enabled and openable", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: /profile.*settings/i })).toBeVisible();

    for (const value of [...SHARED_TABS, ...ADMIN_ONLY_TABS]) {
      const tab = page.locator(`[role="tab"][value="${value}"]`).first();
      await expect(tab).toBeEnabled();
      await tab.click();
      await expect(tab).toHaveAttribute("data-state", "active");
    }
  });

  test("agent cannot change dark/light mode (admin-only control)", async ({ page }) => {
    await loginAgent(page);
    await page.goto("/profile");
    // Activate theme tab
    await page.locator(`[role="tab"][value="theme"]`).first().click();

    // Light/Dark mode toggle is admin-only per the page copy.
    const lightDarkToggle = page.getByRole("button", { name: /^(light|dark) mode$/i });
    await expect(lightDarkToggle).toHaveCount(0);
  });

  test("admin sees Light/Dark mode control", async ({ page }) => {
    await loginAdmin(page);
    await page.goto("/profile");
    await page.locator(`[role="tab"][value="theme"]`).first().click();

    const lightDarkToggle = page.getByRole("button", { name: /^(light|dark) mode$/i }).first();
    await expect(lightDarkToggle).toBeVisible();
  });
});