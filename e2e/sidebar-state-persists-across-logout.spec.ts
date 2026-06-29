import { test, expect, type Page } from "@playwright/test";

/**
 * After logging out and signing back in as the SAME user, the sidebar
 * collapsed/expanded preference must be restored from per-user storage,
 * and the active menu highlight must match whichever page the user lands
 * on. Verified for both Agent and Admin roles.
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

async function logout(page: Page) {
  await page.evaluate(async () => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    await supabase.auth.signOut();
  });
  await page.waitForURL(/\/(auth|login)/).catch(() => {});
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

async function verifyRoundTrip(
  page: Page,
  creds: { email: string; password: string },
  landingRoute: string,
) {
  // 1. Sign in, collapse the sidebar, land on a non-default page.
  await login(page, creds.email, creds.password);
  await page.goto(landingRoute);
  await setCollapsed(page, true);
  await expectActiveMatches(page, landingRoute);

  // 2. Sign out, then sign back in as the SAME user.
  await logout(page);
  await login(page, creds.email, creds.password);
  await page.goto(landingRoute);

  // 3. Collapsed preference + active-route highlight must be restored.
  await expect.poll(() => isCollapsed(page)).toBe(true);
  await expectActiveMatches(page, landingRoute);

  // 4. Repeat with the expanded preference.
  await setCollapsed(page, false);
  await logout(page);
  await login(page, creds.email, creds.password);
  await page.goto(landingRoute);
  await expect.poll(() => isCollapsed(page)).toBe(false);
  await expectActiveMatches(page, landingRoute);
}

test.describe("Sidebar state survives logout → login as same user", () => {
  test("agent: collapsed + active highlight restored after re-login", async ({ page }) => {
    test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");
    await verifyRoundTrip(page, { email: AGENT.email!, password: AGENT.password! }, "/notes");
  });

  test("admin: collapsed + active highlight restored after re-login", async ({ page }) => {
    test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");
    await verifyRoundTrip(page, { email: ADMIN.email!, password: ADMIN.password! }, "/audit-log");
  });
});