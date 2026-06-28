import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies the sidebar collapsed/expanded state:
 *  1. persists per user across reloads,
 *  2. persists across route navigations,
 *  3. is isolated per user (admin vs agent don't share state).
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
}

function sidebar(page: Page) {
  return page.locator("aside").first();
}

async function isCollapsed(page: Page): Promise<boolean> {
  // Sidebar width toggles between w-16 (collapsed) and w-64 (expanded).
  const box = await sidebar(page).boundingBox();
  expect(box).not.toBeNull();
  return (box!.width ?? 0) < 100;
}

async function setCollapsed(page: Page, collapsed: boolean) {
  const toggle = page.getByRole("button", { name: /toggle sidebar/i });
  for (let i = 0; i < 2; i++) {
    if ((await isCollapsed(page)) === collapsed) return;
    await toggle.click();
    await page.waitForTimeout(150);
  }
  expect(await isCollapsed(page)).toBe(collapsed);
}

test.describe("Sidebar collapsed state persists per user", () => {
  test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

  test("agent: collapsed state survives reload and route changes", async ({ page }) => {
    await login(page, AGENT.email!, AGENT.password!);
    await page.goto("/dashboard");
    await setCollapsed(page, true);

    // Navigate across routes — state stays collapsed.
    for (const path of ["/my-reported-errors", "/notes", "/profile", "/dashboard"]) {
      await page.goto(path);
      await expect.poll(() => isCollapsed(page)).toBe(true);
    }

    // Hard reload — state restored from per-user storage.
    await page.reload();
    await expect.poll(() => isCollapsed(page)).toBe(true);

    // Expand again, navigate + reload — expanded state also persists.
    await setCollapsed(page, false);
    await page.goto("/notes");
    await expect.poll(() => isCollapsed(page)).toBe(false);
    await page.reload();
    await expect.poll(() => isCollapsed(page)).toBe(false);
  });

  test("per-user isolation: admin and agent keep independent sidebar state", async ({ page }) => {
    test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");

    // Agent collapses their sidebar.
    await login(page, AGENT.email!, AGENT.password!);
    await page.goto("/dashboard");
    await setCollapsed(page, true);
    await logout(page);

    // Admin signs in on the same browser: must start expanded (their own
    // pref), not inherit the agent's collapsed state.
    await login(page, ADMIN.email!, ADMIN.password!);
    await page.goto("/dashboard");
    await setCollapsed(page, false);
    expect(await isCollapsed(page)).toBe(false);
    await page.reload();
    await expect.poll(() => isCollapsed(page)).toBe(false);
    await logout(page);

    // Agent signs back in: their collapsed preference is still in effect.
    await login(page, AGENT.email!, AGENT.password!);
    await page.goto("/dashboard");
    await expect.poll(() => isCollapsed(page)).toBe(true);
  });
});