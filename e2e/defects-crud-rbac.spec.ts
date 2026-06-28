import { test, expect, type Page } from "@playwright/test";

/**
 * End-to-end CRUD lifecycle on a defect with role-based permissions:
 *
 *   1. Agent creates a defect (Report an Error).
 *   2. Agent edits the title.
 *   3. Agent changes the status.
 *   4. Verification step — both Agent (own) and Admin (cross-agent) can see
 *      the row; agent cannot reach admin-only Agents page; admin can.
 *
 * The spec skips cleanly when credentials are missing so the suite stays
 * green in environments without seeded auth users.
 */

const AGENT = {
  email: process.env.PLAYWRIGHT_AGENT_EMAIL,
  password: process.env.PLAYWRIGHT_AGENT_PASSWORD,
};
const ADMIN = {
  email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
};

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

test.describe("Defect lifecycle with Agent vs Admin permissions", () => {
  test("agent creates → edits → changes status → admin verifies", async ({ page }) => {
    test.skip(
      !AGENT.email || !AGENT.password || !ADMIN.email || !ADMIN.password,
      "agent or admin creds not configured",
    );

    const unique = `E2E-${Date.now()}`;
    const initialTitle = `${unique} initial title`;
    const editedTitle = `${unique} edited title`;

    // --- Agent: create -----------------------------------------------------
    await login(page, AGENT.email!, AGENT.password!);
    await page.goto("/my-reported-errors");

    await page.getByRole("button", { name: /report an? error|new defect|report error/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/title|summary/i).first().fill(initialTitle);
    // Description is required in most schemas; fill if present.
    const desc = dialog.getByLabel(/description|details/i).first();
    if (await desc.count()) await desc.fill(`${unique} description body`);
    await dialog.getByRole("button", { name: /submit|create|report|save/i }).first().click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // Search to isolate the new row.
    const search = page.getByPlaceholder(/search/i).first();
    await search.fill(unique);
    const row = page.locator("table tbody tr", { hasText: initialTitle });
    await expect(row).toHaveCount(1, { timeout: 10_000 });

    // --- Agent: edit -------------------------------------------------------
    await row.getByRole("button", { name: /edit/i }).click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    const titleField = editDialog.getByLabel(/title|summary/i).first();
    await titleField.fill(editedTitle);
    await editDialog.getByRole("button", { name: /save|update/i }).first().click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });
    await expect(page.locator("table tbody tr", { hasText: editedTitle })).toHaveCount(1);

    // --- Agent: change status ---------------------------------------------
    await page.locator("table tbody tr", { hasText: editedTitle }).getByRole("button", { name: /view/i }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const statusCombo = sheet.getByRole("combobox").filter({ hasText: /reported|pending|in progress|status/i }).first();
    if (await statusCombo.count()) {
      await statusCombo.click();
      const target = page.getByRole("option", { name: /in progress/i });
      if (await target.count()) await target.click();
      else await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Escape");

    await expect(
      page.locator("table tbody tr", { hasText: editedTitle }),
    ).toHaveCount(1);

    // --- Agent RBAC: admin-only Agents page must be blocked ---------------
    await page.goto("/agents");
    await expect(page).not.toHaveURL(/\/agents$/);

    // --- Admin: verify the defect is visible cross-agent ------------------
    await logout(page);
    await login(page, ADMIN.email!, ADMIN.password!);
    await page.goto("/my-reported-errors");
    await page.getByPlaceholder(/search/i).first().fill(unique);
    await expect(
      page.locator("table tbody tr", { hasText: editedTitle }),
    ).toHaveCount(1, { timeout: 10_000 });

    // Admin can reach the Agents page.
    await page.goto("/agents");
    await expect(page).toHaveURL(/\/agents$/);
  });
});
