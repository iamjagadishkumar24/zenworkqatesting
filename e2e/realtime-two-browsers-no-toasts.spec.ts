import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Two simultaneous browser sessions (Agent + Admin) must receive defect
 * mutations over realtime without manual reloads, AND neither session may
 * ever render toast/toaster UI.
 *
 * Flow:
 *   1. Agent context creates a defect on /my-reported-errors.
 *   2. Admin context (already viewing the same list) sees the new row via
 *      realtime — no reload, no toast.
 *   3. Agent edits the title → admin row updates live.
 *   4. Agent changes status → admin row's status cell updates live.
 *   5. Both sessions are checked for toast UI after every step.
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

async function openSession(
  ctx: BrowserContext,
  creds: { email: string; password: string },
): Promise<Page> {
  const page = await ctx.newPage();
  await login(page, creds.email, creds.password);
  await page.goto("/my-reported-errors");
  return page;
}

test.describe("Realtime two-browser sync stays toast-silent", () => {
  test("agent + admin: create/edit/status changes propagate live with no toasts", async ({
    browser,
  }) => {
    test.skip(
      !AGENT.email || !AGENT.password || !ADMIN.email || !ADMIN.password,
      "agent or admin creds not configured",
    );

    const unique = `E2E-RT-${Date.now()}`;
    const initialTitle = `${unique} initial`;
    const editedTitle = `${unique} edited`;

    const agentCtx = await browser.newContext();
    const adminCtx = await browser.newContext();

    const agentPage = await openSession(agentCtx, {
      email: AGENT.email!,
      password: AGENT.password!,
    });
    const adminPage = await openSession(adminCtx, {
      email: ADMIN.email!,
      password: ADMIN.password!,
    });

    // Admin scopes its list to our unique tag so the realtime row is easy to find.
    await adminPage.getByPlaceholder(/search/i).first().fill(unique);
    await assertNoToastUI(agentPage, "agent: idle");
    await assertNoToastUI(adminPage, "admin: idle");

    // --- Agent creates ----------------------------------------------------
    await agentPage
      .getByRole("button", { name: /report an? error|new defect|report error/i })
      .first()
      .click();
    const createDialog = agentPage.getByRole("dialog");
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel(/title|summary/i).first().fill(initialTitle);
    const desc = createDialog.getByLabel(/description|details/i).first();
    if (await desc.count()) await desc.fill(`${unique} desc`);
    await createDialog
      .getByRole("button", { name: /submit|create|report|save/i })
      .first()
      .click();
    await expect(createDialog).toBeHidden({ timeout: 10_000 });

    // Admin's list must show the new row via realtime — no reload.
    await expect(
      adminPage.locator("table tbody tr", { hasText: initialTitle }),
    ).toHaveCount(1, { timeout: 15_000 });
    await assertNoToastUI(agentPage, "agent: after create");
    await assertNoToastUI(adminPage, "admin: after create");

    // --- Agent edits title -----------------------------------------------
    await agentPage.getByPlaceholder(/search/i).first().fill(unique);
    const agentRow = agentPage.locator("table tbody tr", { hasText: initialTitle });
    await expect(agentRow).toHaveCount(1, { timeout: 10_000 });
    await agentRow.getByRole("button", { name: /edit/i }).click();
    const editDialog = agentPage.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel(/title|summary/i).first().fill(editedTitle);
    await editDialog.getByRole("button", { name: /save|update/i }).first().click();
    await expect(editDialog).toBeHidden({ timeout: 10_000 });

    // Admin sees the rename live.
    await expect(
      adminPage.locator("table tbody tr", { hasText: editedTitle }),
    ).toHaveCount(1, { timeout: 15_000 });
    await expect(
      adminPage.locator("table tbody tr", { hasText: initialTitle }),
    ).toHaveCount(0, { timeout: 15_000 });
    await assertNoToastUI(agentPage, "agent: after edit");
    await assertNoToastUI(adminPage, "admin: after edit");

    // --- Agent changes status --------------------------------------------
    const renamedRow = agentPage.locator("table tbody tr", { hasText: editedTitle });
    await renamedRow.getByRole("button", { name: /view/i }).click();
    const sheet = agentPage.getByRole("dialog");
    await expect(sheet).toBeVisible();

    const statusCombo = sheet
      .getByRole("combobox")
      .filter({ hasText: /reported|pending|in progress|status/i })
      .first();
    let pickedStatus: string | null = null;
    if (await statusCombo.count()) {
      await statusCombo.click();
      const target = agentPage.getByRole("option", { name: /in progress/i });
      if (await target.count()) {
        pickedStatus = "in progress";
        await target.click();
      } else {
        await agentPage.keyboard.press("Escape");
      }
    }
    await agentPage.keyboard.press("Escape");

    if (pickedStatus) {
      // Admin's row's status cell reflects the new status — live.
      await expect
        .poll(
          async () =>
            (
              await adminPage
                .locator("table tbody tr", { hasText: editedTitle })
                .innerText()
            ).toLowerCase(),
          { timeout: 15_000 },
        )
        .toContain(pickedStatus);
    }
    await assertNoToastUI(agentPage, "agent: after status change");
    await assertNoToastUI(adminPage, "admin: after status change");

    await agentCtx.close();
    await adminCtx.close();
  });
});