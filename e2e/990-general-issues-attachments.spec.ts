import { test, expect, type Page } from "@playwright/test";

/**
 * Submits a General 990 Series Issues defect with multiple attachment links
 * and verifies each link renders as an openable anchor in the defect detail.
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

test("General 990 issue: multiple attachment links render and open from detail view", async ({
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

  const title = `E2E G990 Links ${Date.now()}`;
  const links = [
    "https://example.com/screenshot-1.png",
    "https://sharepoint.example.com/doc-2",
    "https://drive.google.com/file/d/abc123/view",
  ];

  // Required fields
  const comboboxes = dialog.getByRole("combobox");
  await comboboxes.nth(0).click();
  await page.getByRole("option", { name: "Dashboard", exact: true }).click();
  await comboboxes.nth(1).click();
  await page.getByRole("option", { name: "Dashboard", exact: true }).click();
  await page.getByLabel(/Issue Summary/i).fill(title);
  await page.getByLabel(/Issue Description/i).fill(
    "Multiple attachment links should be retained and rendered as openable references.",
  );

  // Attachment links — one row exists by default; add two more.
  const linkInputs = () => dialog.locator('input[placeholder="https://…"]');
  await dialog.getByRole("button", { name: /add link/i }).click();
  await dialog.getByRole("button", { name: /add link/i }).click();
  for (let i = 0; i < links.length; i++) {
    await linkInputs().nth(i).fill(links[i]);
  }

  await page.getByRole("button", { name: /report error/i }).last().click();
  await expect(page.getByText(/general 990 series issue reported/i)).toBeVisible();

  // Open the defect from the user's reported list.
  await page.goto("/my-reported-errors");
  await page.getByText(title).first().click();

  // First two links map to the structured Attachment 1 / Attachment 2 link fields.
  for (const label of ["Attachment 1", "Attachment 2"]) {
    const anchor = page.getByRole("link", { name: new RegExp(label, "i") }).first();
    await expect(anchor).toBeVisible();
    await expect(anchor).toHaveAttribute("href", /^https?:\/\//);
  }

  // All links (including overflow) must be visible somewhere in the detail view.
  for (const url of links) {
    await expect(page.getByText(url, { exact: false }).first()).toBeVisible();
  }

  // Verify the first attachment anchor opens (target=_blank → new tab).
  const firstLink = page.getByRole("link", { name: /Attachment 1/i }).first();
  const target = await firstLink.getAttribute("target");
  if (target === "_blank") {
    const [popup] = await Promise.all([context.waitForEvent("page"), firstLink.click()]);
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    expect(popup.url()).toContain("example.com");
    await popup.close();
  } else {
    const href = await firstLink.getAttribute("href");
    expect(href).toBe(links[0]);
  }
});