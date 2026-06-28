import { test, expect, type Page } from "@playwright/test";
import { POST_LOGIN_ROUTES } from "./routes";

/**
 * Asserts the "Made with Lovable" badge is not visible on any app route on
 * either desktop or mobile viewports, and captures full-page visual
 * snapshots so any layout shift introduced by the hide-badge CSS would be
 * caught against the committed baselines.
 *
 * Auth-protected routes require PLAYWRIGHT_ADMIN_EMAIL / _PASSWORD;
 * without creds the suite still exercises every public route.
 */

const ADMIN = {
  email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
};

const PUBLIC_ROUTES = [
  { path: "/", name: "Landing" },
  { path: "/login", name: "Login" },
  { path: "/reset-password", name: "Reset password" },
];

const VIEWPORTS = [
  { id: "desktop", width: 1280, height: 800 },
  { id: "mobile", width: 390, height: 844 },
] as const;

const BADGE_SELECTORS = [
  "#lovable-badge",
  '[id*="lovable-badge"]',
  '[class*="lovable-badge"]',
  "[data-lovable-badge]",
  'a[href*="lovable.dev"]',
  'a[href*="lovable.app"][target="_blank"]',
  'iframe[src*="lovable.dev"]',
  'iframe[src*="lovable.app/badge"]',
].join(", ");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

async function assertBadgeHidden(page: Page) {
  const matches = page.locator(BADGE_SELECTORS);
  const count = await matches.count();
  for (let i = 0; i < count; i++) {
    // Either the element does not exist, or every match is non-visible
    // (display:none / visibility:hidden / clipped to 0×0).
    await expect(matches.nth(i)).toBeHidden();
  }
  // Belt-and-suspenders: no element matching the badge text is visible.
  const text = page.getByText(/made with lovable|edit with lovable/i);
  await expect(text).toHaveCount(0);
}

for (const vp of VIEWPORTS) {
  test.describe(`Lovable badge hidden › ${vp.id}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of PUBLIC_ROUTES) {
      test(`${vp.id} › ${route.name} (${route.path}) has no badge`, async ({ page }) => {
        await page.goto(route.path);
        await page.waitForLoadState("networkidle");
        await assertBadgeHidden(page);
        await expect(page).toHaveScreenshot(
          `badge-hidden-${vp.id}-${route.path.replace(/\W+/g, "_") || "root"}.png`,
          { animations: "disabled", maxDiffPixelRatio: 0.02 },
        );
      });
    }

    test.describe("authenticated routes", () => {
      const hasCreds = !!ADMIN.email && !!ADMIN.password;
      test.skip(
        !hasCreds,
        "Set PLAYWRIGHT_ADMIN_EMAIL/PLAYWRIGHT_ADMIN_PASSWORD to crawl app routes.",
      );
      test.use({ storageState: { cookies: [], origins: [] } });

      const routes = POST_LOGIN_ROUTES.filter((r) => r.roles.includes("admin"));

      for (const route of routes) {
        test(`${vp.id} › ${route.name} (${route.path}) has no badge`, async ({ page }) => {
          await login(page, ADMIN.email!, ADMIN.password!);
          await page.goto(route.path);
          await page.waitForLoadState("networkidle");
          await assertBadgeHidden(page);
          await expect(page).toHaveScreenshot(
            `badge-hidden-${vp.id}-${route.path.replace(/\W+/g, "_")}.png`,
            { animations: "disabled", maxDiffPixelRatio: 0.02 },
          );
        });
      }
    });
  });
}