import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: The RealtimeHealthMenu renders on Defects (My Reported Errors) and
 * Reports, and its reconnect counter increments when realtime is forced
 * offline. Skipped unless PLAYWRIGHT_USER_EMAIL/PASSWORD are provided
 * (any signed-in role works — the menu is on every dashboard surface).
 */

const EMAIL = process.env.PLAYWRIGHT_USER_EMAIL ?? process.env.PLAYWRIGHT_AGENT_EMAIL;
const PASSWORD =
  process.env.PLAYWRIGHT_USER_PASSWORD ?? process.env.PLAYWRIGHT_AGENT_PASSWORD;

test.describe("RealtimeHealthMenu on Defects + Reports", () => {
  test.skip(!EMAIL || !PASSWORD, "Set PLAYWRIGHT_USER_EMAIL/PASSWORD to run.");

  async function login(page: Page) {
    await page.goto("/auth");
    await page.getByLabel(/email/i).fill(EMAIL!);
    await page.getByLabel(/password/i).fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/(dashboard|my-reported-errors)/);
  }

  async function openMenuAndAssertShape(page: Page) {
    const trigger = page.getByLabel(/open realtime health details/i);
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByTestId("rt-health-status")).toBeVisible();
    await expect(page.getByTestId("rt-health-channel")).toBeVisible();
    await expect(page.getByTestId("rt-health-last-event")).toBeVisible();
    await expect(page.getByTestId("rt-health-reconnects")).toBeVisible();
  }

  async function getReconnectCount(page: Page): Promise<number> {
    const text = (await page.getByTestId("rt-health-reconnects").innerText()).trim();
    return Number(text.match(/\d+/)?.[0] ?? "0");
  }

  for (const route of ["/my-reported-errors", "/reports"] as const) {
    test(`renders on ${route}`, async ({ page }) => {
      await login(page);
      await page.goto(route);
      await openMenuAndAssertShape(page);
    });
  }

  test("reconnect counter ticks up when realtime is forced offline", async ({
    page,
    context,
  }) => {
    await login(page);
    await page.goto("/reports");

    // Wait for the initial connection to settle.
    await expect(page.locator('[data-realtime-status="connected"]').first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel(/open realtime health details/i).click();
    const before = await getReconnectCount(page);

    // Drop the network → the websocket dies → Supabase realtime retries.
    await context.setOffline(true);
    try {
      await expect
        .poll(() => getReconnectCount(page), {
          timeout: 20_000,
          intervals: [500, 1000, 2000],
        })
        .toBeGreaterThan(before);
    } finally {
      await context.setOffline(false);
    }
  });
});