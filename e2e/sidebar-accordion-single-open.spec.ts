import { test, expect, type Page, type Locator } from "@playwright/test";

/**
 * Sidebar groups behave as an accordion: opening one expandable group must
 * collapse any other group that is currently expanded. Verified for both
 * Agent and Admin sessions.
 *
 * Expandable group buttons are identified by `aria-controls` starting with
 * "nav-group-" (see AppShell.tsx). The open/closed state is read from
 * `aria-expanded` on the same button.
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

function groupButtons(page: Page): Locator {
  return sidebar(page).locator('button[aria-controls^="nav-group-"]');
}

async function expectExpanded(button: Locator, expanded: boolean) {
  await expect(button).toHaveAttribute("aria-expanded", expanded ? "true" : "false");
}

async function setOpen(button: Locator, shouldBeOpen: boolean) {
  const current = (await button.getAttribute("aria-expanded")) === "true";
  if (current !== shouldBeOpen) await button.click();
  await expectExpanded(button, shouldBeOpen);
}

async function verifyAccordion(page: Page) {
  // Make sure the sidebar is expanded so group buttons are rendered.
  await page.goto("/dashboard");
  const expand = page.getByRole("button", { name: /expand sidebar/i });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  await expect(sidebar(page)).toHaveAttribute("data-collapsed", "false");

  const buttons = groupButtons(page);
  const count = await buttons.count();
  test.skip(count < 2, `need at least 2 expandable groups, found ${count}`);

  const first = buttons.nth(0);
  const second = buttons.nth(1);

  // Start from a known state: close both.
  await setOpen(first, false);
  await setOpen(second, false);

  // Open the first → only the first is expanded.
  await setOpen(first, true);
  await expectExpanded(second, false);

  // Open the second → the first must auto-collapse.
  await setOpen(second, true);
  await expectExpanded(first, false);

  // And re-opening the first must collapse the second.
  await setOpen(first, true);
  await expectExpanded(second, false);

  // At most one group is ever expanded at any time.
  const expandedCount = await sidebar(page)
    .locator('button[aria-controls^="nav-group-"][aria-expanded="true"]')
    .count();
  expect(expandedCount).toBe(1);
}

test.describe("Sidebar accordion: only one dropdown open at a time", () => {
  test("agent: opening one group collapses any other open group", async ({ page }) => {
    test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");
    await login(page, AGENT.email!, AGENT.password!);
    await verifyAccordion(page);
  });

  test("admin: opening one group collapses any other open group", async ({ page }) => {
    test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");
    await login(page, ADMIN.email!, ADMIN.password!);
    await verifyAccordion(page);
  });
});
