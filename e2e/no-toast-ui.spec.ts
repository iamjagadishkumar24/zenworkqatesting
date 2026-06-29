import { test, expect, type Page } from "@playwright/test";

/**
 * The Toaster mount was intentionally removed from the root layout: business
 * logic (audit logging, realtime, background sync) still calls `toast.*`,
 * but nothing must ever render in the UI. These checks guard against
 * regressions where someone re-adds <Toaster /> or a competing toast lib.
 *
 * Covers: post-login, route navigation, and common write events
 * (task assignment, status update) for both Agent and Admin roles.
 */

const AGENT = {
  email: process.env.PLAYWRIGHT_AGENT_EMAIL,
  password: process.env.PLAYWRIGHT_AGENT_PASSWORD,
};
const ADMIN = {
  email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
};

// Selectors any popular toast library renders into. None should ever exist.
const TOAST_SELECTORS = [
  "[data-sonner-toaster]",
  "[data-sonner-toast]",
  "ol.sonner-toaster, ol[data-sonner-toaster]",
  "[role='status'].toast, [role='status'][data-toast]",
  ".Toastify__toast-container",
  ".react-hot-toast",
];

async function assertNoToastUI(page: Page) {
  for (const sel of TOAST_SELECTORS) {
    await expect(page.locator(sel), `unexpected toast element: ${sel}`).toHaveCount(0);
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

// Trigger `toast.*` calls directly from the page context — this exercises the
// same code path that login / task-assignment / status-update handlers use.
// If a Toaster is mounted anywhere, these would render a popup.
async function fireToastsFromApp(page: Page) {
  await page.evaluate(async () => {
    const sonner = await import("/node_modules/sonner/dist/index.mjs").catch(
      () => import("sonner" as string),
    );
    const t = (sonner as { toast: (msg: string) => void }).toast;
    t("login-success");
    (sonner as { toast: { success: (m: string) => void } }).toast.success("task assigned");
    (sonner as { toast: { error: (m: string) => void } }).toast.error("status updated");
    (sonner as { toast: { message: (m: string) => void } }).toast.message("background sync");
  });
  // Give any (mis-mounted) toaster a frame to render.
  await page.waitForTimeout(400);
}

async function verifyRole(page: Page, creds: { email: string; password: string }, routes: string[]) {
  await login(page, creds.email, creds.password);
  // Immediately after login: no toast banner.
  await assertNoToastUI(page);

  for (const path of routes) {
    await page.goto(path);
    await assertNoToastUI(page);
  }

  // Simulate the events that previously surfaced popups.
  await fireToastsFromApp(page);
  await assertNoToastUI(page);

  // Hard reload — still nothing.
  await page.reload();
  await assertNoToastUI(page);
}

test.describe("No toast/toaster UI ever appears", () => {
  test("agent: no toasts on login, navigation, or events", async ({ page }) => {
    test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");
    await verifyRole(
      page,
      { email: AGENT.email!, password: AGENT.password! },
      ["/dashboard", "/my-reported-errors", "/notes", "/profile"],
    );
  });

  test("admin: no toasts on login, navigation, or events", async ({ page }) => {
    test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");
    await verifyRole(
      page,
      { email: ADMIN.email!, password: ADMIN.password! },
      ["/dashboard", "/agents", "/audit-log", "/reports", "/profile"],
    );
  });
});