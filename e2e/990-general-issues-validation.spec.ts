import { test, expect, type Page } from "@playwright/test";

/**
 * Validation + edit coverage for the General 990 Series Issues dialog.
 *
 * 1. Invalid URL formats in any link field block submission and surface a
 *    validation error toast.
 * 2. Empty attachment-link rows are ignored and do not block submission when
 *    other required fields are valid.
 * 3. Editing an existing General 990 defect's attachment links persists the
 *    new URLs and they render on the detail view.
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

async function openGeneral990Dialog(page: Page) {
  await page.goto("/990-forms");
  await page
    .locator("div", { hasText: /General 990 Series Issues/ })
    .getByRole("button", { name: /report error/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: /general 990 series issue/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillRequiredFields(page: Page, dialog: ReturnType<Page["getByRole"]>, title: string) {
  const cbs = dialog.getByRole("combobox");
  await cbs.nth(0).click();
  await page.getByRole("option", { name: "Dashboard", exact: true }).click();
  await cbs.nth(1).click();
  await page.getByRole("option", { name: "Dashboard", exact: true }).click();
  await page.getByLabel(/Issue Summary/i).fill(title);
  await page.getByLabel(/Issue Description/i).fill("Validation coverage for attachment URL rules.");
}

test.describe("General 990 Series Issues — URL validation & edit", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("invalid attachment URL blocks submission and shows validation error", async ({ page }) => {
    const dialog = await openGeneral990Dialog(page);
    await fillRequiredFields(page, dialog, `E2E Invalid URL ${Date.now()}`);

    // Put a non-URL in the first attachment link row.
    const linkInputs = dialog.locator('input[placeholder="https://…"]');
    await linkInputs.first().fill("not a url");

    await page.getByRole("button", { name: /report error/i }).last().click();
    await expect(page.getByText(/invalid attachment link/i)).toBeVisible();
    // Dialog must remain open — submission was blocked.
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/general 990 series issue reported/i)).toHaveCount(0);
  });

  test("invalid Screenshot/Reference/Supporting URL blocks submission", async ({ page }) => {
    const dialog = await openGeneral990Dialog(page);
    await fillRequiredFields(page, dialog, `E2E Invalid Ref ${Date.now()}`);

    await page.getByLabel(/Reference URL/i).fill("htp:/bad");
    await page.getByRole("button", { name: /report error/i }).last().click();
    await expect(page.getByText(/reference url must be a valid url/i)).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test("empty attachment rows are ignored and valid links submit successfully", async ({ page }) => {
    const dialog = await openGeneral990Dialog(page);
    const title = `E2E Mixed Links ${Date.now()}`;
    await fillRequiredFields(page, dialog, title);

    // Add two extra rows, leave them empty; fill only the first.
    await dialog.getByRole("button", { name: /add link/i }).click();
    await dialog.getByRole("button", { name: /add link/i }).click();
    const linkInputs = dialog.locator('input[placeholder="https://…"]');
    await linkInputs.nth(0).fill("https://example.com/only-link");

    await page.getByRole("button", { name: /report error/i }).last().click();
    await expect(page.getByText(/general 990 series issue reported/i)).toBeVisible();
  });

  test("editing an existing defect's attachment links updates the detail view", async ({ page }) => {
    // Create a defect with an initial attachment link.
    const dialog = await openGeneral990Dialog(page);
    const title = `E2E Edit Links ${Date.now()}`;
    await fillRequiredFields(page, dialog, title);
    const linkInputs = dialog.locator('input[placeholder="https://…"]');
    await linkInputs.first().fill("https://example.com/original");
    await page.getByRole("button", { name: /report error/i }).last().click();
    await expect(page.getByText(/general 990 series issue reported/i)).toBeVisible();

    // Open the defect and switch to edit mode.
    await page.goto("/my-reported-errors");
    await page.getByText(title).first().click();
    await page.getByRole("button", { name: /^edit$/i }).click();

    const updated = "https://example.com/updated-attachment";
    const a1 = page.getByLabel(/Attachment Link 1/i);
    await a1.fill(updated);

    await page.getByRole("button", { name: /save changes|resubmit/i }).click();

    // Detail view should now show the updated link as an openable anchor.
    const anchor = page.getByRole("link", { name: /Attachment 1/i }).first();
    await expect(anchor).toBeVisible();
    await expect(anchor).toHaveAttribute("href", updated);
  });
});