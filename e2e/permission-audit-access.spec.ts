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

test.describe("Permission Audit History — access surface", () => {
  test.skip(
    !process.env.PLAYWRIGHT_AGENT_EMAIL || !process.env.PLAYWRIGHT_ADMIN_EMAIL,
    "Requires PLAYWRIGHT_*_EMAIL/PASSWORD env vars",
  );

  test("admin: link lives under Settings, not under Rights Management", async ({ page }) => {
    await loginAdmin(page);

    // Sidebar Settings group exposes a Permission Audit link.
    const nav = page.getByRole("navigation");
    const settingsToggle = nav.getByRole("button", { name: /^Settings$/ });
    await settingsToggle.click();
    const auditLink = nav.getByRole("link", { name: /Permission Audit/i });
    await expect(auditLink).toBeVisible();
    await expect(auditLink).toHaveAttribute("href", "/permission-audit");

    // The Rights Management page must not link to / embed Permission Audit.
    await page.goto("/rights-management");
    await expect(
      page.getByRole("heading", { name: /Rights Management/i }),
    ).toBeVisible();
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: /Permission Audit/i })).toHaveCount(0);
    await expect(
      main.getByRole("heading", { name: /Permission Audit History/i }),
    ).toHaveCount(0);

    // Direct navigation works for admin.
    await page.goto("/permission-audit");
    await expect(
      page.getByRole("heading", { name: /Permission Audit History/i }),
    ).toBeVisible();
    expect(page.url()).toContain("/permission-audit");
  });

  test("agent: cannot see Permission Audit anywhere, direct URL is denied", async ({ page }) => {
    await loginAgent(page);

    // Sidebar: admin-only entries are hidden for agents.
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: /Permission Audit/i })).toHaveCount(0);
    // Rights Management itself is admin-only — also absent for agents.
    await expect(nav.getByRole("link", { name: /Rights Management/i })).toHaveCount(0);

    // Direct navigation to either URL is gated by the _admin layout
    // and redirects non-admin users away from the page.
    await page.goto("/permission-audit");
    await page.waitForURL((u) => !u.pathname.startsWith("/permission-audit"), {
      timeout: 5000,
    });
    expect(page.url()).not.toContain("/permission-audit");
    await expect(
      page.getByRole("heading", { name: /Permission Audit History/i }),
    ).toHaveCount(0);

    await page.goto("/rights-management");
    await page.waitForURL((u) => !u.pathname.startsWith("/rights-management"), {
      timeout: 5000,
    });
    expect(page.url()).not.toContain("/rights-management");
  });
});