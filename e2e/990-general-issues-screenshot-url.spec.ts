import { test, expect, type Page } from "@playwright/test";

/**
 * Submitting the General 990 Series Issues dialog with an invalid Screenshot
 * URL must surface a validation error, keep the dialog open, and NOT create a
 * new defect.
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

test("invalid Screenshot URL blocks submission and creates no defect", async ({ page }) => {
  await login(page);
  await page.goto("/990-forms");

  await page
    .locator("div", { hasText: /General 990 Series Issues/ })
    .getByRole("button", { name: /report error/i })
    .first()
    .click();

  const dialog = page.getByRole("dialog", { name: /general 990 series issue/i });
  await expect(dialog).toBeVisible();

  const title = `E2E Bad Screenshot ${Date.now()}`;
  const cbs = dialog.getByRole("combobox");
  await cbs.nth(0).click();
  await page.getByRole("option", { name: "Dashboard", exact: true }).click();
  await cbs.nth(1).click();
  await page.getByRole("option", { name: "Dashboard", exact: true }).click();
  await page.getByLabel(/Issue Summary/i).fill(title);
  await page.getByLabel(/Issue Description/i)
    .fill("Submission should fail because the Screenshot URL is not a valid URL.");

  // Invalid Screenshot URL — missing scheme/host.
  await page.getByLabel(/Screenshot URL/i).fill("not-a-valid-url");

  await page.getByRole("button", { name: /report error/i }).last().click();

  // Inline validation error appears, dialog stays open, success toast never shows.
  await expect(page.getByText(/screenshot url must be a valid url/i)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(page.getByText(/general 990 series issue reported/i)).toHaveCount(0);

  // No defect with this unique title was created.
  await page.goto("/my-reported-errors");
  await expect(page.getByText(title)).toHaveCount(0);
});