import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: verify the app NEVER shows the legacy hard-error copy
 * for transient failures, and instead recovers (auto-retry / inline retry).
 *
 * Two scenarios:
 *  1. Flaky network: first N requests to the database/Data API fail, then
 *     succeed. The page must end up rendered, not stuck on the root error.
 *  2. Transient chunk/dynamic-import failure: the first request to a
 *     JS chunk 502s, then succeeds on retry.
 *
 * The root error component auto-retries transient errors; this test pins
 * that contract.
 */

const FORBIDDEN_TEXT = "This page didn't load";
const VERSION_ENDPOINT = "/api/public/app-version";

async function gotoAndAssertNoHardError(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  // Give the app up to 15s — covers a couple of auto-retry cycles.
  await expect.poll(
    async () => (await page.locator("body").innerText()).includes(FORBIDDEN_TEXT),
    { timeout: 15_000, intervals: [250, 500, 1000] },
  ).toBe(false);
  await expect(page.locator("body")).not.toContainText(FORBIDDEN_TEXT);
}

test.describe("transient failure recovery", () => {
  test("flaky Data API → recovers without a hard error page", async ({ page }) => {
    let dataApiHits = 0;
    await page.route(/\/rest\/v1\//, async (route) => {
      dataApiHits += 1;
      if (dataApiHits <= 2) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "SERVICE_UNAVAILABLE", fallback: true }),
        });
        return;
      }
      await route.continue();
    });

    await gotoAndAssertNoHardError(page, "/");
  });

  test("transient chunk load failure → app does not surface hard error", async ({ page }) => {
    let chunkFails = 0;
    await page.route(/\.(?:js|mjs)(?:\?.*)?$/, async (route) => {
      const url = route.request().url();
      // Only fail one non-entry chunk, once, to simulate a stale deploy.
      if (chunkFails < 1 && /assets\/.+\-[A-Za-z0-9]{6,}\.(?:js|mjs)/.test(url)) {
        chunkFails += 1;
        await route.fulfill({ status: 502, body: "" });
        return;
      }
      await route.continue();
    });

    await gotoAndAssertNoHardError(page, "/");
  });

  test("flaky network on first paint → final render contains real content", async ({ page }) => {
    let failed = 0;
    await page.route(/\/rest\/v1\//, async (route) => {
      if (failed < 1) {
        failed += 1;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await gotoAndAssertNoHardError(page, "/");
    // Sanity: app shell rendered something non-empty.
    const text = (await page.locator("body").innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
  });

  test("stale bundle version skew → clears app-shell caches and reloads once", async ({ page }) => {
    let versionChecks = 0;
    await page.route(`**${VERSION_ENDPOINT}**`, async (route) => {
      versionChecks += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "Cache-Control": "no-store" },
        body: JSON.stringify({ version: "e2e-new-deployment" }),
      });
    });

    await page.goto("/");
    await page.evaluate(async () => {
      await caches.open("workbox-precache-v2-test").then((cache) => cache.put("/old.js", new Response("old")));
      window.dispatchEvent(new CustomEvent("vite:preloadError", { detail: new Error("Failed to fetch dynamically imported module") }));
    });

    await page.waitForURL(/__app_version=e2e-new-deployment/, { timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(FORBIDDEN_TEXT);
    expect(versionChecks).toBeGreaterThan(0);
    const remainingCaches = await page.evaluate(() => caches.keys());
    expect(remainingCaches).not.toContain("workbox-precache-v2-test");
  });
});
