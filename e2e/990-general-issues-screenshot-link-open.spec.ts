import { test, expect, type Page } from "@playwright/test";

/**
 * Confirms the Screenshot link on the General 990 defect detail view:
 *   1. opens in a new tab with the exact submitted href, and
 *   2. has an accessible name and is keyboard-focusable + activatable.
 */

const AGENT = {
  email: process.env.PLAYWRIGHT_AGENT_EMAIL,
  password: process.env.PLAYWRIGHT_AGENT_PASSWORD,
};

async function login(page: Page) {
  if (!AGENT.email || !AGENT.password) test.skip(true, "Missing PLAYWRIGHT_AGENT_* env vars");
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(AGENT.email!);
  await page.getByLabel(/password/i).fill(AGENT.password!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

async function createScreenshotDefect(page: Page, screenshotUrl: string) {
  await page.goto("/990-forms");
  await page
    .locator("div", { hasText: /General 990 Series Issues/ })
    .getByRole("button", { name: /report error/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: /general 990 series issue/i });
  const cbs = dialog.getByRole("combobox");
  await cbs.nth(0).click();
  await page.getByRole("option", { name: "Dashboard", exact: true }).click();
  await cbs.nth(1).click();
  await page.getByRole("option", { name: "Dashboard", exact: true }).click();
  const title = `E2E Screenshot Link ${Date.now()}`;
  await page.getByLabel(/Issue Summary/i).fill(title);
  await page.getByLabel(/Issue Description/i).fill("Screenshot link open + a11y check.");
  await page.getByLabel(/Screenshot URL/i).fill(screenshotUrl);
  await page.getByRole("button", { name: /report error/i }).last().click();
  await expect(page.getByText(/general 990 series issue reported/i)).toBeVisible();

  await page.goto("/my-reported-errors");
  await page.getByText(title).first().click();
  return title;
}

test.describe("General 990 — Screenshot link open + accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Screenshot link opens in a new tab with the expected href", async ({ page, context }) => {
    const url = "https://example.com/screenshots/open-in-new-tab.png";
    await createScreenshotDefect(page, url);

    const link = page.getByRole("link", { name: /Screenshot/i }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", url);
    await expect(link).toHaveAttribute("target", "_blank");

    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    expect(popup.url()).toBe(url);
    await popup.close();
  });

  test("Screenshot link has an accessible name and is keyboard-focusable/activatable", async ({
    page,
    context,
  }) => {
    const url = "https://example.com/screenshots/a11y.png";
    await createScreenshotDefect(page, url);

    const link = page.getByRole("link", { name: /Screenshot/i }).first();
    await expect(link).toBeVisible();

    // Accessible name: non-empty and not just the raw URL.
    const accessibleName =
      (await link.getAttribute("aria-label")) ?? (await link.textContent()) ?? "";
    expect(accessibleName.trim().length).toBeGreaterThan(0);
    expect(accessibleName.toLowerCase()).toContain("screenshot");

    // Native anchor — implicit tabindex 0, no negative tabindex override.
    const tabindex = await link.getAttribute("tabindex");
    expect(tabindex === null || Number(tabindex) >= 0).toBeTruthy();

    // Keyboard focus + activation.
    await link.focus();
    await expect(link).toBeFocused();
    const [popup] = await Promise.all([
      context.waitForEvent("page"),
      page.keyboard.press("Enter"),
    ]);
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    expect(popup.url()).toBe(url);
    await popup.close();
  });
});