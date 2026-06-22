import { test, expect, type Page } from "@playwright/test";

/**
 * For Form 990, 990-T, 990-EZ, and 990-PF, opening the Report dialog must
 * show the Schedules / Related Forms section with the correct options. After
 * submitting with one or more selections, the chosen schedules must be
 * persisted and visible on the resulting defect record.
 *
 * Requires PLAYWRIGHT_AGENT_EMAIL / PLAYWRIGHT_AGENT_PASSWORD (any signed-in
 * user with permission to create defects works).
 */

const AGENT = {
  email: process.env.PLAYWRIGHT_AGENT_EMAIL,
  password: process.env.PLAYWRIGHT_AGENT_PASSWORD,
};

type Case = {
  form: string;
  expectedOptions: string[];
  pick: string[];
};

const CASES: Case[] = [
  {
    form: "Form 990",
    expectedOptions: [
      "Form 4562",
      "Form 8868",
      "Form 4466",
      "Form 2220",
      "Form 990-T",
      "Schedule A",
      "Schedule B",
      "Schedule C",
      "Schedule D",
      "Schedule E",
      "Schedule F",
      "Schedule G",
      "Schedule H",
      "Schedule I",
      "Schedule J",
      "Schedule K",
      "Schedule L",
      "Schedule M",
      "Schedule N",
      "Schedule R",
      "Schedule O",
      "Supplemental Information",
    ],
    pick: ["Schedule A", "Schedule D"],
  },
  {
    form: "Form 990-T",
    expectedOptions: [
      "Form 4562",
      "Form 4797",
      "Form 4626",
      "Schedule A (990-T)",
      "Form 3800",
      "Supplemental Information",
    ],
    pick: ["Schedule A (990-T)", "Form 4797"],
  },
  {
    form: "Form 990-EZ",
    expectedOptions: [
      "Schedule A",
      "Schedule B",
      "Schedule C",
      "Schedule E",
      "Schedule G",
      "Schedule L",
      "Schedule N",
      "Schedule O",
      "Supplemental Information",
    ],
    pick: ["Schedule B"],
  },
  {
    form: "Form 990-PF",
    expectedOptions: ["Supplemental Information"],
    pick: ["Supplemental Information"],
  },
];

async function login(page: Page) {
  if (!AGENT.email || !AGENT.password) test.skip(true, "Missing PLAYWRIGHT_AGENT_* env vars");
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(AGENT.email!);
  await page.getByLabel(/password/i).fill(AGENT.password!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

test.describe("990 schedules / related forms", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/990-forms");
  });

  for (const c of CASES) {
    test(`${c.form}: shows correct schedule options, validates, and persists selection`, async ({
      page,
    }) => {
      // Open the report dialog for this specific form card.
      const card = page.locator(`text=${c.form}`).first().locator("xpath=ancestor::*[contains(@class,'group') or self::div][1]");
      await card.getByRole("button", { name: /report error/i }).click();

      const section = page.getByTestId("schedules-section");
      await expect(section).toBeVisible();
      for (const opt of c.expectedOptions) {
        await expect(section.getByText(opt, { exact: true })).toBeVisible();
      }

      // Fill required fields.
      const title = `E2E ${c.form} ${Date.now()}`;
      await page.getByLabel(/Error Title/i).fill(title);
      await page.getByLabel(/Description \/ Comments/i).fill(`Auto-test for ${c.form}`);

      // Validation: submitting without selecting a schedule must surface an error.
      await page.getByRole("button", { name: /create error/i }).click();
      await expect(page.getByText(/select at least one/i)).toBeVisible();

      // Pick the schedules, then submit.
      for (const opt of c.pick) {
        await section.getByText(opt, { exact: true }).click();
      }
      await page.getByRole("button", { name: /create error/i }).click();
      await expect(page.getByText(/error reported/i)).toBeVisible();

      // Open the just-created defect and verify schedules render as structured data.
      await page.goto("/my-reported-errors");
      await page.getByText(title).first().click();
      const shown = page.getByTestId("defect-schedules");
      await expect(shown).toBeVisible();
      for (const opt of c.pick) {
        await expect(shown).toContainText(opt);
      }
    });
  }
});
