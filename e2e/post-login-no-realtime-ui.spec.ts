import { test, expect, type Page } from "@playwright/test";
import { POST_LOGIN_ROUTES, FORBIDDEN_REALTIME_PHRASES } from "./routes";

/**
 * Post-login regression: across every authenticated route, for both Admin
 * and QA Agent roles, the realtime subscription must stay alive in the
 * backend while NO realtime status text or toast surfaces in the UI.
 *
 * Also captures visual snapshots of the post-login header and the toaster
 * region per route (baselines stored under tests/e2e/__snapshots__/, created
 * automatically on first `bun run e2e:update`).
 *
 * Required env vars (spec is skipped without them):
 *   PLAYWRIGHT_ADMIN_EMAIL, PLAYWRIGHT_ADMIN_PASSWORD
 *   PLAYWRIGHT_AGENT_EMAIL, PLAYWRIGHT_AGENT_PASSWORD
 *   PLAYWRIGHT_BASE_URL (optional)
 */

const CREDS = {
  admin: {
    email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
    password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
  },
  agent: {
    email: process.env.PLAYWRIGHT_AGENT_EMAIL,
    password: process.env.PLAYWRIGHT_AGENT_PASSWORD,
  },
} as const;

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

async function assertRealtimeAlive(page: Page) {
  // The store writes a read-only probe to window inside the subscribe
  // callback. Its presence proves the channel was created post-login and
  // the subscription handshake fired.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const probe = (
            window as unknown as { __qaRealtimeProbe?: { channelName?: string; status?: string } }
          ).__qaRealtimeProbe;
          return probe
            ? { channel: probe.channelName ?? null, status: probe.status ?? null }
            : null;
        }),
      { timeout: 15_000, intervals: [500, 1000, 2000] },
    )
    .toMatchObject({ status: "SUBSCRIBED" });
}

async function assertNoRealtimeIndicator(page: Page) {
  // No dedicated indicator components rendered.
  await expect(page.locator("[data-realtime-status]")).toHaveCount(0);
  await expect(page.getByLabel(/realtime health/i)).toHaveCount(0);
  // No forbidden text anywhere on the visible page.
  const bodyText = (await page.locator("body").innerText()).normalize();
  for (const pattern of FORBIDDEN_REALTIME_PHRASES) {
    expect(bodyText, `route leaked realtime phrase ${pattern}`).not.toMatch(pattern);
  }
  // No sonner toast surfaced with realtime copy.
  const toasterText = await page
    .locator("[data-sonner-toaster]")
    .innerText()
    .catch(() => "");
  for (const pattern of FORBIDDEN_REALTIME_PHRASES) {
    expect(toasterText, `toaster leaked realtime phrase ${pattern}`).not.toMatch(pattern);
  }
}

for (const role of ["admin", "agent"] as const) {
  const creds = CREDS[role];
  const hasCreds = !!creds.email && !!creds.password;

  test.describe(`post-login as ${role}: realtime UI stays hidden, subscription stays alive`, () => {
    test.skip(
      !hasCreds,
      `Set PLAYWRIGHT_${role.toUpperCase()}_EMAIL and PLAYWRIGHT_${role.toUpperCase()}_PASSWORD to run.`,
    );

    test.use({ storageState: { cookies: [], origins: [] } });

    const routes = POST_LOGIN_ROUTES.filter((r) => r.roles.includes(role));

    for (const route of routes) {
      test(`${role} › ${route.name} (${route.path})`, async ({ page }) => {
        await login(page, creds.email!, creds.password!);
        await assertRealtimeAlive(page);

        await page.goto(route.path);
        await page.waitForLoadState("networkidle");

        await assertNoRealtimeIndicator(page);
        // Subscription must still be alive after navigation.
        await assertRealtimeAlive(page);

        // Visual snapshots: header + toaster region. Baselines auto-created
        // on first `bun run e2e:update`; later runs diff against them.
        const header = page.locator("header").first();
        if (await header.count()) {
          await expect(header).toHaveScreenshot(
            `${role}-${route.path.replace(/\W+/g, "_")}-header.png`,
            { animations: "disabled", maxDiffPixelRatio: 0.02 },
          );
        }
        const toaster = page.locator("[data-sonner-toaster]").first();
        if (await toaster.count()) {
          await expect(toaster).toHaveScreenshot(
            `${role}-${route.path.replace(/\W+/g, "_")}-toaster.png`,
            { animations: "disabled", maxDiffPixelRatio: 0.02 },
          );
        }
      });
    }
  });
}
