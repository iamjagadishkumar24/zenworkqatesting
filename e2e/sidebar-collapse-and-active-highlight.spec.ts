import { test, expect, type Page } from "@playwright/test";

/**
 * Consolidated checks (per the QA requirement):
 *   1. Collapsible sidebar state persists across hard reloads.
 *   2. The active menu highlight (`aria-current="page"`) matches the
 *      current page, in BOTH expanded and collapsed states.
 * Verified for both Agent and Admin roles.
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
  return page.locator('aside[aria-label="Primary"]').first();
}

async function isCollapsed(page: Page): Promise<boolean> {
  const box = await sidebar(page).boundingBox();
  expect(box).not.toBeNull();
  return (box!.width ?? 0) < 100;
}

async function setCollapsed(page: Page, collapsed: boolean) {
  const toggle = page.getByRole("button", {
    name: collapsed ? /collapse sidebar/i : /expand sidebar/i,
  });
  if ((await isCollapsed(page)) !== collapsed) {
    await toggle.click();
    await expect.poll(() => isCollapsed(page)).toBe(collapsed);
  }
}

async function expectActiveMatches(page: Page, pathname: string) {
  const active = sidebar(page).locator('a[aria-current="page"]');
  await expect(active).toHaveCount(1);
  const href = await active.getAttribute("href");
  expect(href).toBeTruthy();
  expect(new URL(href!, "http://x").pathname).toBe(pathname);
}

async function verifyRole(page: Page, routes: string[]) {
  // Expanded state: highlight tracks current route, persists across reloads.
  await page.goto(routes[0]);
  await setCollapsed(page, false);
  for (const path of routes) {
    await page.goto(path);
    await expectActiveMatches(page, path);
    await page.reload();
    await expect.poll(() => isCollapsed(page)).toBe(false);
    await expectActiveMatches(page, path);
  }

  // Collapse and reload — collapsed state and highlight both persist.
  await setCollapsed(page, true);
  for (const path of routes) {
    await page.goto(path);
    await expect.poll(() => isCollapsed(page)).toBe(true);
    await expectActiveMatches(page, path);
    await page.reload();
    await expect.poll(() => isCollapsed(page)).toBe(true);
    await expectActiveMatches(page, path);
  }
}

test.describe("Sidebar: collapse persists + active highlight matches route", () => {
  test("agent role", async ({ page }) => {
    test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");
    await login(page, AGENT.email!, AGENT.password!);
    await verifyRole(page, ["/dashboard", "/my-reported-errors", "/notes", "/profile"]);
  });

  test("admin role", async ({ page }) => {
    test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");
    await login(page, ADMIN.email!, ADMIN.password!);
    await verifyRole(page, ["/dashboard", "/agents", "/audit-log", "/reports", "/profile"]);
  });
});