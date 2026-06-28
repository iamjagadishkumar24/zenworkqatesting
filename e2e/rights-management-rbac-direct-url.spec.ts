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

test.describe("Rights Management — RBAC via direct URL", () => {
  test.skip(
    !process.env.PLAYWRIGHT_AGENT_EMAIL || !process.env.PLAYWRIGHT_ADMIN_EMAIL,
    "Requires PLAYWRIGHT_*_EMAIL/PASSWORD env vars",
  );

  test("admin: direct URL renders the Rights Management page", async ({ page }) => {
    await loginAdmin(page);

    await page.goto("/rights-management");
    await expect(page).toHaveURL(/\/rights-management$/);
    await expect(
      page.getByRole("heading", { name: /Rights Management/i }),
    ).toBeVisible();

    // Sidebar entry is visible for admins.
    const nav = page.getByRole("navigation");
    await expect(
      nav.getByRole("link", { name: /Rights Management/i }),
    ).toBeVisible();
  });

  test("agent: direct URL is denied — redirected and nothing renders", async ({ page }) => {
    await loginAgent(page);

    // Sidebar entry is hidden for agents.
    const nav = page.getByRole("navigation");
    await expect(
      nav.getByRole("link", { name: /Rights Management/i }),
    ).toHaveCount(0);

    // Direct URL: gated by the _admin layout; agent is redirected away.
    await page.goto("/rights-management");
    await page.waitForURL((u) => !u.pathname.startsWith("/rights-management"), {
      timeout: 5000,
    });
    expect(page.url()).not.toContain("/rights-management");

    // Page heading must not be present anywhere after redirect.
    await expect(
      page.getByRole("heading", { name: /Rights Management/i }),
    ).toHaveCount(0);

    // Defense-in-depth: even an in-app navigation attempt via history API
    // must not leave the agent on the protected route.
    await page.evaluate(() => {
      window.history.pushState({}, "", "/rights-management");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await page.waitForURL((u) => !u.pathname.startsWith("/rights-management"), {
      timeout: 5000,
    });
    await expect(
      page.getByRole("heading", { name: /Rights Management/i }),
    ).toHaveCount(0);
  });
});
