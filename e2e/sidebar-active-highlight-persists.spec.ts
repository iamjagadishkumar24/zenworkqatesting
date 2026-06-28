import { test, expect, type Page } from "@playwright/test";

/**
 * After a hard reload on a given route, the sidebar must still highlight the
 * link that matches the current URL — for both Agent and Admin sessions, and
 * across both expanded and collapsed sidebar states.
 *
 * "Highlighted" is asserted via `aria-current="page"`, which AppShell.tsx
 * sets on whichever link's `to` matches the current location.
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

async function expectActiveLinkMatches(page: Page, pathname: string) {
  const active = sidebar(page).locator('a[aria-current="page"]');
  // Exactly one active link per pathname, and its href ends with the path.
  await expect(active).toHaveCount(1);
  const href = await active.getAttribute("href");
  expect(href).toBeTruthy();
  expect(new URL(href!, "http://x").pathname).toBe(pathname);
}

async function verifyAcrossRoutes(page: Page, routes: string[]) {
  for (const path of routes) {
    await page.goto(path);
    await expectActiveLinkMatches(page, path);
    await page.reload();
    await expectActiveLinkMatches(page, path);
  }
}

test.describe("Sidebar active highlight persists after reload", () => {
  test("agent: highlight stays on the current route after reload", async ({ page }) => {
    test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");
    await login(page, AGENT.email!, AGENT.password!);
    await verifyAcrossRoutes(page, [
      "/dashboard",
      "/my-reported-errors",
      "/notes",
      "/profile",
    ]);
  });

  test("admin: highlight stays on the current route after reload (admin-only routes)", async ({
    page,
  }) => {
    test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");
    await login(page, ADMIN.email!, ADMIN.password!);
    await verifyAcrossRoutes(page, [
      "/dashboard",
      "/agents",
      "/audit-log",
      "/reports",
      "/profile",
    ]);
  });

  test("admin: highlight survives reload when the sidebar is collapsed", async ({ page }) => {
    test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");
    await login(page, ADMIN.email!, ADMIN.password!);

    // Collapse the sidebar; collapsed state is persisted per user, so it will
    // still be collapsed after the reload below.
    await page.goto("/dashboard");
    const toggle = page.getByRole("button", { name: /collapse sidebar/i });
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
    }
    await expect(sidebar(page)).toHaveAttribute("data-collapsed", "true");

    for (const path of ["/dashboard", "/agents", "/reports"]) {
      await page.goto(path);
      await expect(sidebar(page)).toHaveAttribute("data-collapsed", "true");
      await expectActiveLinkMatches(page, path);
      await page.reload();
      await expect(sidebar(page)).toHaveAttribute("data-collapsed", "true");
      await expectActiveLinkMatches(page, path);
    }
  });
});