import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: RealtimeHealthMenu renders on Defects (My Reported Errors) and
 * Reports, the reconnect counter and status update deterministically when
 * we simulate a Supabase channel error via the `window.__qaRealtimeMock`
 * hook exposed by the QA store, the reconnect counter stops increasing
 * once the connection is restored, and a toast tells the user when
 * realtime drops and recovers.
 *
 * Skipped unless PLAYWRIGHT_USER_EMAIL/PASSWORD are provided (any signed-in
 * role works — the menu is on every dashboard surface).
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

  async function openMenu(page: Page) {
    await page.getByLabel(/open realtime health details/i).click();
    await expect(page.getByTestId("rt-health-status")).toBeVisible();
    await expect(page.getByTestId("rt-health-channel")).toBeVisible();
    await expect(page.getByTestId("rt-health-last-event")).toBeVisible();
    await expect(page.getByTestId("rt-health-reconnects")).toBeVisible();
  }

  async function getReconnectCount(page: Page): Promise<number> {
    const text = (await page.getByTestId("rt-health-reconnects").innerText()).trim();
    return Number(text.match(/\d+/)?.[0] ?? "0");
  }

  async function getStatusText(page: Page): Promise<string> {
    return (await page.getByTestId("rt-health-status").innerText()).trim().toLowerCase();
  }

  async function waitForMockHook(page: Page) {
    await page.waitForFunction(
      () => !!(window as unknown as { __qaRealtimeMock?: unknown }).__qaRealtimeMock,
      null,
      { timeout: 15_000 },
    );
  }

  // Drive store setters directly — no WebSocket race, no network mode.
  const setStatus = (page: Page, status: string) =>
    page.evaluate((s) => {
      const m = (window as unknown as {
        __qaRealtimeMock?: { setStatus: (s: string) => void };
      }).__qaRealtimeMock;
      m?.setStatus(s);
    }, status);

  const bumpReconnect = (page: Page) =>
    page.evaluate(() => {
      const m = (window as unknown as {
        __qaRealtimeMock?: { bumpReconnect: () => void };
      }).__qaRealtimeMock;
      m?.bumpReconnect();
    });

  for (const route of ["/my-reported-errors", "/reports"] as const) {
    test(`renders + reconnects deterministically on ${route}`, async ({ page }) => {
      await login(page);
      await page.goto(route);
      await waitForMockHook(page);
      await openMenu(page);

      const before = await getReconnectCount(page);

      // Simulate a channel error: status flips and counter increments.
      await setStatus(page, "reconnecting");
      await bumpReconnect(page);

      await expect.poll(() => getStatusText(page)).toBe("reconnecting");
      await expect.poll(() => getReconnectCount(page)).toBe(before + 1);

      // Toast banner surfaces the disconnect to the user.
      await expect(page.getByText(/realtime disconnected/i)).toBeVisible({ timeout: 5_000 });

      // Restore the connection. Counter must stop increasing and status flips.
      await setStatus(page, "connected");
      await expect.poll(() => getStatusText(page)).toBe("connected");
      await expect(page.getByText(/realtime reconnected/i)).toBeVisible({ timeout: 5_000 });

      const settled = await getReconnectCount(page);
      await page.waitForTimeout(2_000);
      expect(await getReconnectCount(page)).toBe(settled);
    });
  }
});