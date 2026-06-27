import { test, expect, type Page } from "@playwright/test";

const ADMIN = {
  email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
};

const PAGES = ["/dashboard", "/defects", "/reports", "/settings"];

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

async function setMode(page: Page, mode: "light" | "dark") {
  await page.goto("/settings");
  // Admins see a Select/Radio for Light/Dark/System; match flexibly.
  const trigger = page
    .getByRole("combobox", { name: /theme|mode/i })
    .or(page.getByRole("button", { name: /theme|mode/i }))
    .first();
  if (await trigger.count()) {
    await trigger.click();
    await page.getByRole("option", { name: new RegExp(`^${mode}$`, "i") }).click();
  } else {
    await page.getByRole("radio", { name: new RegExp(mode, "i") }).click();
  }
  await expect
    .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
    .toBe(mode === "dark");
}

test.describe("Admin Light/Dark mode persists across pages and refresh", () => {
  test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");

  test("switching to Dark persists after refresh on every page", async ({ page }) => {
    await login(page, ADMIN.email!, ADMIN.password!);
    await setMode(page, "dark");

    for (const path of PAGES) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")), {
          timeout: 10_000,
        })
        .toBe(true);
    }

    // Reset to Light and confirm it sticks across the same pages.
    await setMode(page, "light");
    for (const path of PAGES) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")), {
          timeout: 10_000,
        })
        .toBe(false);
    }
  });
});
