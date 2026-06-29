import { test, expect, type Page } from "@playwright/test";

/**
 * Verify the role-specific label for the Management nav entry:
 *   - Agents see "Task Management" as a flat sidebar link.
 *   - Admins see "Agents & Tasks Management" as an expandable group.
 *
 * The label must remain correct after login, navigation across routes,
 * and a full page reload.
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
  return page.getByRole("navigation", { name: /main navigation/i });
}

test.describe("Sidebar Management label by role", () => {
  test.describe("Agent", () => {
    test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

    test('agent sees "Task Management" and never the admin label', async ({ page }) => {
      await login(page, AGENT.email!, AGENT.password!);
      const nav = sidebar(page);

      // After login
      await expect(nav.getByRole("link", { name: /^task management$/i })).toBeVisible();
      await expect(nav.getByText(/agents?\s*&\s*tasks?\s*management/i)).toHaveCount(0);
      await expect(nav.getByRole("button", { name: /^management$/i })).toHaveCount(0);

      // After navigating to another route
      await page.goto("/dashboard", { waitUntil: "networkidle" });
      await expect(nav.getByRole("link", { name: /^task management$/i })).toBeVisible();
      await expect(nav.getByText(/agents?\s*&\s*tasks?\s*management/i)).toHaveCount(0);

      // After a full reload
      await page.reload({ waitUntil: "networkidle" });
      await expect(nav.getByRole("link", { name: /^task management$/i })).toBeVisible();
      await expect(nav.getByText(/agents?\s*&\s*tasks?\s*management/i)).toHaveCount(0);
    });
  });

  test.describe("Admin", () => {
    test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");

    test('admin sees "Agents & Tasks Management" and never the agent-only label', async ({
      page,
    }) => {
      await login(page, ADMIN.email!, ADMIN.password!);
      const nav = sidebar(page);

      // After login — group header is a button (expandable accordion).
      await expect(
        nav.getByRole("button", { name: /agents?\s*&\s*tasks?\s*management/i }),
      ).toBeVisible();
      // The agent-only flat label "Task Management" must not appear as a
      // top-level link (it remains the submenu item label).
      await expect(nav.getByRole("link", { name: /^task management$/i })).toHaveCount(0);

      // After navigating to another route
      await page.goto("/dashboard", { waitUntil: "networkidle" });
      await expect(
        nav.getByRole("button", { name: /agents?\s*&\s*tasks?\s*management/i }),
      ).toBeVisible();
      await expect(nav.getByRole("link", { name: /^task management$/i })).toHaveCount(0);

      // After a full reload
      await page.reload({ waitUntil: "networkidle" });
      await expect(
        nav.getByRole("button", { name: /agents?\s*&\s*tasks?\s*management/i }),
      ).toBeVisible();

      // Expanding the group reveals the underlying admin submenu items,
      // which still include the original "Task Management" and "Agent Management"
      // routes — proving functionality is unchanged.
      await nav
        .getByRole("button", { name: /agents?\s*&\s*tasks?\s*management/i })
        .click();
      const group = nav.getByRole("group", {
        name: /agents?\s*&\s*tasks?\s*management/i,
      });
      await expect(group.getByRole("link", { name: /task management/i })).toBeVisible();
      await expect(group.getByRole("link", { name: /agent management/i })).toBeVisible();
    });
  });
});