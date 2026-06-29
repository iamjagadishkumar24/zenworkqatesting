import { test, expect, type Page } from "@playwright/test";

/**
 * Defect-lifecycle no-toast guard: while creating, editing, and changing
 * the status of a defect — as both Agent and Admin — no toast / toaster UI
 * may render. Business logic (audit log, realtime) still runs; only the
 * visual popup layer must stay gone.
 */

const AGENT = {
  email: process.env.PLAYWRIGHT_AGENT_EMAIL,
  password: process.env.PLAYWRIGHT_AGENT_PASSWORD,
};
const ADMIN = {
  email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
};

const TOAST_SELECTORS = [
  "[data-sonner-toaster]",
  "[data-sonner-toast]",
  "ol.sonner-toaster, ol[data-sonner-toaster]",
  "[role='status'].toast, [role='status'][data-toast]",
  ".Toastify__toast-container",
  ".react-hot-toast",
];

async function assertNoToastUI(page: Page, where: string) {
  for (const sel of TOAST_SELECTORS) {
    await expect(page.locator(sel), `unexpected toast (${where}): ${sel}`).toHaveCount(0);
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

async function logout(page: Page) {
  await page.evaluate(async () => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    await supabase.auth.signOut();
    localStorage.clear();
  });
}

async function runLifecycleAndAssertSilent(
  page: Page,
  role: "agent" | "admin",
  unique: string,
) {
  const initialTitle = `${unique} initial`;
  const editedTitle = `${unique} edited`;

  await page.goto("/my-reported-errors");
  await assertNoToastUI(page, `${role}: list view`);

  // --- Create ----------------------------------------------------------
  await page
    .getByRole("button", { name: /report an? error|new defect|report error/i })
    .first()
    .click();
  const createDialog = page.getByRole("dialog");
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel(/title|summary/i).first().fill(initialTitle);
  const desc = createDialog.getByLabel(/description|details/i).first();
  if (await desc.count()) await desc.fill(`${unique} desc`);
  await createDialog.getByRole("button", { name: /submit|create|report|save/i }).first().click();
  await expect(createDialog).toBeHidden({ timeout: 10_000 });
  // Right when the success toast would have fired:
  await assertNoToastUI(page, `${role}: after create`);

  await page.getByPlaceholder(/search/i).first().fill(unique);
  const row = page.locator("table tbody tr", { hasText: initialTitle });
  await expect(row).toHaveCount(1, { timeout: 10_000 });

  // --- Edit ------------------------------------------------------------
  await row.getByRole("button", { name: /edit/i }).click();
  const editDialog = page.getByRole("dialog");
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel(/title|summary/i).first().fill(editedTitle);
  await editDialog.getByRole("button", { name: /save|update/i }).first().click();
  await expect(editDialog).toBeHidden({ timeout: 10_000 });
  await assertNoToastUI(page, `${role}: after edit`);

  const editedRow = page.locator("table tbody tr", { hasText: editedTitle });
  await expect(editedRow).toHaveCount(1);

  // --- Change status ---------------------------------------------------
  await editedRow.getByRole("button", { name: /view/i }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const statusCombo = sheet
    .getByRole("combobox")
    .filter({ hasText: /reported|pending|in progress|status/i })
    .first();
  if (await statusCombo.count()) {
    await statusCombo.click();
    const target = page.getByRole("option", { name: /in progress/i });
    if (await target.count()) await target.click();
    else await page.keyboard.press("Escape");
  }
  await page.keyboard.press("Escape");
  await assertNoToastUI(page, `${role}: after status change`);

  // Give any deferred toast a frame, then re-check.
  await page.waitForTimeout(400);
  await assertNoToastUI(page, `${role}: settled`);
}

test.describe("Defect lifecycle is toast-silent", () => {
  test("agent: create → edit → status change shows no toast UI", async ({ page }) => {
    test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");
    await login(page, AGENT.email!, AGENT.password!);
    await runLifecycleAndAssertSilent(page, "agent", `E2E-NOTOAST-A-${Date.now()}`);
  });

  test("admin: create → edit → status change shows no toast UI", async ({ page }) => {
    test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");
    await login(page, ADMIN.email!, ADMIN.password!);
    await runLifecycleAndAssertSilent(page, "admin", `E2E-NOTOAST-D-${Date.now()}`);
    await logout(page);
  });
});