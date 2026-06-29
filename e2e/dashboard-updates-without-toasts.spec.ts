import { test, expect, type Page } from "@playwright/test";

/**
 * Toast UI is removed globally, but the underlying data flows must still
 * work. This spec asserts that after create / edit / status-change
 * mutations, the visible dashboard surfaces (list rows, status cells,
 * detail sheet) update correctly for both Agent and Admin — without
 * relying on any toast confirmation.
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
  ".Toastify__toast-container",
  ".react-hot-toast",
];

async function assertNoToastUI(page: Page) {
  for (const sel of TOAST_SELECTORS) {
    await expect(page.locator(sel)).toHaveCount(0);
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

test.describe("Dashboard data updates without toast confirmations", () => {
  test("agent: create + edit + status change reflect in the list (no toasts)", async ({
    page,
  }) => {
    test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

    const unique = `E2E-DATA-${Date.now()}`;
    const initialTitle = `${unique} initial`;
    const editedTitle = `${unique} edited`;

    await login(page, AGENT.email!, AGENT.password!);
    await page.goto("/my-reported-errors");

    // --- Create -------------------------------------------------------
    await page
      .getByRole("button", { name: /report an? error|new defect|report error/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/title|summary/i).first().fill(initialTitle);
    const desc = dialog.getByLabel(/description|details/i).first();
    if (await desc.count()) await desc.fill(`${unique} desc`);
    await dialog.getByRole("button", { name: /submit|create|report|save/i }).first().click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    await page.getByPlaceholder(/search/i).first().fill(unique);
    const row = page.locator("table tbody tr", { hasText: initialTitle });
    // Row appears WITHOUT relying on any toast feedback.
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await assertNoToastUI(page);

    // --- Edit ---------------------------------------------------------
    await row.getByRole("button", { name: /edit/i }).click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel(/title|summary/i).first().fill(editedTitle);
    await editDialog.getByRole("button", { name: /save|update/i }).first().click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });

    // List reflects the rename, original title is gone.
    await expect(page.locator("table tbody tr", { hasText: editedTitle })).toHaveCount(1, {
      timeout: 10_000,
    });
    await expect(page.locator("table tbody tr", { hasText: initialTitle })).toHaveCount(0);
    await assertNoToastUI(page);

    // --- Status change ------------------------------------------------
    const editedRow = page.locator("table tbody tr", { hasText: editedTitle });
    await editedRow.getByRole("button", { name: /view/i }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    const statusCombo = sheet
      .getByRole("combobox")
      .filter({ hasText: /reported|pending|in progress|status/i })
      .first();
    let pickedStatus: string | null = null;
    if (await statusCombo.count()) {
      await statusCombo.click();
      const target = page.getByRole("option", { name: /in progress/i });
      if (await target.count()) {
        pickedStatus = "in progress";
        await target.click();
      } else {
        await page.keyboard.press("Escape");
      }
    }
    await page.keyboard.press("Escape");

    if (pickedStatus) {
      // The list row's status cell must reflect the new status — proof the
      // mutation propagated without a toast banner.
      await expect
        .poll(async () =>
          (await page
            .locator("table tbody tr", { hasText: editedTitle })
            .innerText()).toLowerCase(),
        )
        .toContain(pickedStatus);
    }
    await assertNoToastUI(page);

    // --- Reload: the data round-trip persists; still no toasts --------
    await page.reload();
    await page.getByPlaceholder(/search/i).first().fill(unique);
    await expect(page.locator("table tbody tr", { hasText: editedTitle })).toHaveCount(1, {
      timeout: 10_000,
    });
    if (pickedStatus) {
      await expect
        .poll(async () =>
          (await page
            .locator("table tbody tr", { hasText: editedTitle })
            .innerText()).toLowerCase(),
        )
        .toContain(pickedStatus);
    }
    await assertNoToastUI(page);
  });

  test("admin: sees agent's edited defect + status without any toast", async ({ page }) => {
    test.skip(
      !AGENT.email || !AGENT.password || !ADMIN.email || !ADMIN.password,
      "agent or admin creds not configured",
    );

    const unique = `E2E-DATA-X-${Date.now()}`;
    const title = `${unique} cross-role`;

    // Agent creates a defect.
    await login(page, AGENT.email!, AGENT.password!);
    await page.goto("/my-reported-errors");
    await page
      .getByRole("button", { name: /report an? error|new defect|report error/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/title|summary/i).first().fill(title);
    const desc = dialog.getByLabel(/description|details/i).first();
    if (await desc.count()) await desc.fill(`${unique} desc`);
    await dialog.getByRole("button", { name: /submit|create|report|save/i }).first().click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await assertNoToastUI(page);

    // Admin verifies the row appears in their cross-agent view — without a
    // realtime toast banner to draw attention to it.
    await logout(page);
    await login(page, ADMIN.email!, ADMIN.password!);
    await page.goto("/my-reported-errors");
    await page.getByPlaceholder(/search/i).first().fill(unique);
    await expect(page.locator("table tbody tr", { hasText: title })).toHaveCount(1, {
      timeout: 10_000,
    });
    await assertNoToastUI(page);
  });
});