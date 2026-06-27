import { test, expect } from "@playwright/test";
import { loginAgent } from "./agent-theme-helpers";

const CANONICAL = "/my-reported-errors";

test.describe("Legacy Reported Errors URL aliases", () => {
  test.skip(
    !process.env.PLAYWRIGHT_AGENT_EMAIL || !process.env.PLAYWRIGHT_AGENT_PASSWORD,
    "Requires PLAYWRIGHT_AGENT_EMAIL/PASSWORD env vars",
  );

  test("/reported-errors → /my-reported-errors (preserves query, replace)", async ({ page }) => {
    await loginAgent(page);

    await page.goto("/dashboard");
    const beforeLen = await page.evaluate(() => history.length);

    await page.goto("/reported-errors?q=foo&status=open");
    await page.waitForURL(/\/my-reported-errors/);

    const url = new URL(page.url());
    expect(url.pathname).toBe(CANONICAL);
    expect(url.searchParams.get("q")).toBe("foo");
    expect(url.searchParams.get("status")).toBe("open");

    // replace: true → no extra history entry beyond the goto itself.
    const afterLen = await page.evaluate(() => history.length);
    expect(afterLen - beforeLen).toBeLessThanOrEqual(1);

    // Back should land before /dashboard's successor, not on /reported-errors.
    await page.goBack();
    expect(new URL(page.url()).pathname).not.toBe("/reported-errors");
  });

  test("/reports/reported-errors → /my-reported-errors (preserves query, replace)", async ({
    page,
  }) => {
    await loginAgent(page);

    await page.goto("/dashboard");
    const beforeLen = await page.evaluate(() => history.length);

    await page.goto("/reports/reported-errors?q=bar&page=2");
    await page.waitForURL(/\/my-reported-errors/);

    const url = new URL(page.url());
    expect(url.pathname).toBe(CANONICAL);
    expect(url.searchParams.get("q")).toBe("bar");
    expect(url.searchParams.get("page")).toBe("2");

    const afterLen = await page.evaluate(() => history.length);
    expect(afterLen - beforeLen).toBeLessThanOrEqual(1);

    await page.goBack();
    expect(new URL(page.url()).pathname).not.toBe("/reports/reported-errors");
  });

  test("canonical /my-reported-errors still loads directly", async ({ page }) => {
    await loginAgent(page);
    await page.goto(CANONICAL);
    expect(new URL(page.url()).pathname).toBe(CANONICAL);
  });
});
