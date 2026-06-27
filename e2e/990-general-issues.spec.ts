import { test, expect, type Page } from "@playwright/test";

/**
 * Submits a defect via the new "General 990 Series Issues" panel on the 990
 * Form Testing page and verifies it surfaces in the defects flow with the
 * correct module ("990 Forms") and form name ("General 990 Series Issues")
 * in both the list and the detail view.
 *
 * Requires PLAYWRIGHT_AGENT_EMAIL / PLAYWRIGHT_AGENT_PASSWORD.
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

test.describe("General 990 Series Issues panel", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/990-forms");
  });

  test("submits a general 990 issue and shows it in the defects flow", async ({ page }) => {
    // Panel renders above the form cards.
    const panel = page.locator("text=General 990 Series Issues").first();
    await expect(panel).toBeVisible();

    // Open the dedicated dialog.
    await page
      .locator("div", { hasText: /General 990 Series Issues/ })
      .getByRole("button", { name: /report error/i })
      .first()
      .click();

    await expect(page.getByRole("dialog", { name: /general 990 series issue/i })).toBeVisible();

    const title = `E2E General 990 ${Date.now()}`;
    const ein = "12-3456789";

    await page.getByLabel(/EIN/i).fill(ein);

    // Issue Category (first combobox in dialog)
    const dialog = page.getByRole("dialog");
    const comboboxes = dialog.getByRole("combobox");
    await comboboxes.nth(0).click();
    await page.getByRole("option", { name: "Dashboard", exact: true }).click();
    await comboboxes.nth(1).click();
    await page.getByRole("option", { name: "Dashboard", exact: true }).click();

    await page.getByLabel(/Issue Summary/i).fill(title);
    await page
      .getByLabel(/Issue Description/i)
      .fill("Dashboard counts are wrong and the page hangs while loading 990 series data.");

    // Validation: clearing category should block submit.
    // (Quick sanity — leave as a normal positive submit below.)
    await page
      .getByRole("button", { name: /report error/i })
      .last()
      .click();
    await expect(page.getByText(/general 990 series issue reported/i)).toBeVisible();

    // Defect surfaces in the user's reported list with correct module/form name.
    await page.goto("/my-reported-errors");
    const row = page.getByText(title).first();
    await expect(row).toBeVisible();

    // Module + form name visible somewhere on the row container.
    const rowContainer = row
      .locator("xpath=ancestor::tr | ancestor::*[contains(@class,'card')][1]")
      .first();
    await expect(rowContainer).toContainText("990 Forms");
    await expect(rowContainer).toContainText("General 990 Series Issues");

    // Open detail view.
    await row.click();
    const detail = page.getByRole("dialog").or(page.locator('[role="region"]')).first();
    await expect(detail).toContainText(title);
    await expect(detail).toContainText("General 990 Series Issues");
    await expect(detail).toContainText("990 Forms");
    await expect(detail).toContainText(ein);
    await expect(detail).toContainText("Category: Dashboard");
    await expect(detail).toContainText("Area: Dashboard");
  });
});
