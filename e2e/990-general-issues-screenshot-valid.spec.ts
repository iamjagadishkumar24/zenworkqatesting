import { test, expect, type Page } from "@playwright/test";

/**
 * Submits a General 990 Series Issues defect with a valid Screenshot URL and
 * verifies the screenshot link renders on the detail view as a clickable
 * anchor pointing at the submitted URL.
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

test("valid Screenshot URL renders as a clickable link in the defect detail view", async ({
  page,
  context,
}) => {
  await login(page);
  await page.goto("/990-forms");

  await page
    .locator("div", { hasText: /General 990 Series Issues/ })
    .getByRole("button", { name: /report error/i })
    .first()
    .click();

  const dialog = page.getByRole("dialog", { name: /general 990 series issue/i });
  await expect(dialog).toBeVisible();

  const title = `E2E Screenshot OK ${Date.now()}`;
  const screenshotUrl = "https://example.com/screenshots/dashboard-broken.png";

  const cbs = dialog.getByRole("combobox");
  await cbs.nth(0).click();
  await page.getByRole("option", { name: "Dashboard", exact: true }).click();
  await cbs.nth(1).click();
  await page.getByRole("option", { name: "Dashboard", exact: true }).click();
  await page.getByLabel(/Issue Summary/i).fill(title);
  await page
    .getByLabel(/Issue Description/i)
    .fill("Submission should succeed and the screenshot link must render on the detail view.");
  await page.getByLabel(/Screenshot URL/i).fill(screenshotUrl);

  await page
    .getByRole("button", { name: /report error/i })
    .last()
    .click();
  await expect(page.getByText(/general 990 series issue reported/i)).toBeVisible();

  // Open the defect detail view.
  await page.goto("/my-reported-errors");
  await page.getByText(title).first().click();

  // Screenshot link renders with the exact submitted href.
  const link = page.getByRole("link", { name: /Screenshot/i }).first();
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", screenshotUrl);

  // Confirm it's clickable: opens in a new tab if target=_blank, otherwise href matches.
  const target = await link.getAttribute("target");
  if (target === "_blank") {
    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    expect(popup.url()).toContain("example.com");
    await popup.close();
  } else {
    expect(await link.getAttribute("href")).toBe(screenshotUrl);
  }
});
