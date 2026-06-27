import { test, expect } from "@playwright/test";

/**
 * Regression: the Dashboard previously crashed with React minified error
 * #310 ("Rendered more hooks than during the previous render") because
 * DeadlineCountdown called a useMemo after an early return. After the fix
 * + dashboard ErrorBoundary, navigating to /dashboard must never show:
 *   - "Minified React error #310"
 *   - The boundary fallback "Something went wrong loading this section"
 *   - The hard-failure copy "This page didn't load"
 */

const FORBIDDEN = [
  /Minified React error #310/i,
  /Something went wrong loading this section/i,
  /This page didn't load/i,
];

test("dashboard renders (or redirects to auth) without React #310", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

  // Allow router/auth resolution + a couple of state ticks.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1500);

  const body = await page.locator("body").innerText();
  for (const re of FORBIDDEN) {
    expect(body, `body should not contain ${re}`).not.toMatch(re);
  }
  expect(
    pageErrors.find((m) =>
      /Minified React error #310|hooks than during the previous render/i.test(m),
    ),
    `unexpected hook-order pageerror: ${pageErrors.join(" | ")}`,
  ).toBeUndefined();
});
