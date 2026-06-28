import { test, expect, type Page } from "@playwright/test";

/**
 * After SPA navigation between routes, the sidebar must highlight the link
 * matching the new URL — and only that link. Verified for both Agent and
 * Admin sessions. Uses `aria-current="page"` (set by AppShell.tsx) as the
 * source of truth for which link is "active".
 *
 * This complements sidebar-active-highlight-persists.spec.ts, which covers
 * the same invariant across hard reloads. This spec covers in-app
 * navigation (no reload), which exercises the live router subscription.
 */

const AGENT = {
  email: process.env.PLAYWRIGHT_AGENT_EMAIL,
  password: process.env.PLAYWRIGHT_AGENT_PASSWORD,
};
const ADMIN = {
  email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

function sidebar(page: Page) {
  return page.locator('aside[aria-label="Primary"]');
}

async function expectOnlyActive(page: Page, pathname: string) {
  const active = sidebar(page).locator('a[aria-current="page"]');
  await expect(active).toHaveCount(1);
  const href = await active.getAttribute("href");
  expect(href).toBeTruthy();
  expect(new URL(href!, "http://x").pathname).toBe(pathname);
}

async function navigateAndVerify(page: Page, routes: string[]) {
  for (const path of routes) {
    // SPA navigate — no reload. The router updates the URL and the sidebar
    // must update `aria-current="page"` to the matching link.
    await page.evaluate((p) => {
      window.history.pushState({}, "", p);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, path);
    await page.waitForURL((url) => url.pathname === path);
    await expectOnlyActive(page, path);
  }
}

test.describe("Sidebar active highlight tracks SPA navigation", () => {
  test("agent: highlight follows the active route", async ({ page }) => {
    test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");
    await login(page, AGENT.email!, AGENT.password!);
    await page.goto("/dashboard");
    await expectOnlyActive(page, "/dashboard");
    await navigateAndVerify(page, [
      "/my-reported-errors",
      "/notes",
      "/profile",
      "/dashboard",
    ]);
  });

  test("admin: highlight follows the active route (admin-only routes)", async ({ page }) => {
    test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");
    await login(page, ADMIN.email!, ADMIN.password!);
    await page.goto("/dashboard");
    await expectOnlyActive(page, "/dashboard");
    await navigateAndVerify(page, [
      "/agents",
      "/audit-log",
      "/reports",
      "/profile",
      "/dashboard",
    ]);
  });
});
