import { test, expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * E2E: Admin creates a defect → Agent dashboard updates over realtime
 * without a page refresh. Two isolated browser contexts simulate the two
 * users concurrently, so the only path data can travel between them is
 * the Supabase realtime channel.
 *
 * This spec is skipped by default. To run it locally or in CI, provide:
 *
 *   PLAYWRIGHT_ADMIN_EMAIL, PLAYWRIGHT_ADMIN_PASSWORD
 *   PLAYWRIGHT_AGENT_EMAIL, PLAYWRIGHT_AGENT_PASSWORD
 *   PLAYWRIGHT_BASE_URL                (optional, defaults to preview URL)
 *
 * The admin and agent accounts must already exist in the target environment
 * with the appropriate roles, and the agent must be assignable on defects
 * created by the admin (or the admin must assign the new defect to them).
 */

const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
const AGENT_EMAIL = process.env.PLAYWRIGHT_AGENT_EMAIL;
const AGENT_PASSWORD = process.env.PLAYWRIGHT_AGENT_PASSWORD;

const hasCreds =
  !!ADMIN_EMAIL && !!ADMIN_PASSWORD && !!AGENT_EMAIL && !!AGENT_PASSWORD;

test.describe("realtime: admin creates defect → agent dashboard updates live", () => {
  test.skip(!hasCreds, "Set PLAYWRIGHT_ADMIN_* and PLAYWRIGHT_AGENT_* env vars to run.");

  async function login(page: Page, email: string, password: string) {
    await page.goto("/auth");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/dashboard/);
  }

  async function openContext(browser: BrowserContext["browser"] extends () => infer B ? B : never) {
    // placeholder for inference — real call is via test.step below
    return browser;
  }
  void openContext;

  test("agent's Open KPI ticks up without a refresh", async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const agentCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    const agentPage = await agentCtx.newPage();

    try {
      await Promise.all([
        login(adminPage, ADMIN_EMAIL!, ADMIN_PASSWORD!),
        login(agentPage, AGENT_EMAIL!, AGENT_PASSWORD!),
      ]);

      // Agent realtime channel must be subscribed before the admin acts.
      // The UI no longer renders a status indicator; we read the store's
      // window probe directly so backend liveness is asserted without
      // requiring any visible "Live"/"Realtime" text.
      await expect
        .poll(
          async () =>
            agentPage.evaluate(() => {
              const probe = (window as unknown as {
                __qaRealtimeProbe?: { status?: string };
              }).__qaRealtimeProbe;
              return probe?.status ?? null;
            }),
          { timeout: 15_000, intervals: [500, 1000, 2000] },
        )
        .toBe("SUBSCRIBED");

      const openKpi = agentPage.getByRole("region", { name: /open errors/i }).first();
      const before = Number(((await openKpi.innerText()).match(/\d+/)?.[0]) ?? "0");

      // Admin creates a defect assigned to the agent under test.
      await adminPage.goto("/defects");
      await adminPage.getByRole("button", { name: /new defect|report defect|add defect/i }).first().click();
      const title = `E2E realtime ${Date.now()}`;
      await adminPage.getByLabel(/title/i).fill(title);
      const agentSelect = adminPage.getByLabel(/assigned agent|assign to/i);
      if (await agentSelect.count()) {
        await agentSelect.click();
        await adminPage.getByRole("option", { name: new RegExp(AGENT_EMAIL!.split("@")[0], "i") }).click();
      }
      await adminPage.getByRole("button", { name: /^create$|^save$|^submit$/i }).click();

      // Agent dashboard updates without navigation.
      await expect
        .poll(
          async () => Number(((await openKpi.innerText()).match(/\d+/)?.[0]) ?? "0"),
          { timeout: 15_000, intervals: [500, 1000, 2000] },
        )
        .toBeGreaterThan(before);

      // Realtime health UI has been removed; verify the probe still reports
      // SUBSCRIBED after the live update was processed.
      const finalStatus = await agentPage.evaluate(() => {
        const probe = (window as unknown as { __qaRealtimeProbe?: { status?: string } })
          .__qaRealtimeProbe;
        return probe?.status ?? null;
      });
      expect(finalStatus).toBe("SUBSCRIBED");
    } finally {
      await adminCtx.close();
      await agentCtx.close();
    }
  });
});