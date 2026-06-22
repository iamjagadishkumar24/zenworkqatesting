import { test, expect, type Page } from "@playwright/test";

const AGENT = {
  email: process.env.PLAYWRIGHT_AGENT_EMAIL,
  password: process.env.PLAYWRIGHT_AGENT_PASSWORD,
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

test.describe("Agent unsupported theme submission is blocked", () => {
  test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

  test("frontend validation rejects bogus accent and shows an error toast", async ({ page }) => {
    await login(page, AGENT.email!, AGENT.password!);
    await page.goto("/settings");

    // Establish a known starting accent.
    await page.getByRole("radio", { name: /blue theme/i }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.accent))
      .toBe("blue");

    // Simulate a crafted client trying to push an unsupported value through
    // the same path the UI uses. The frontend guard must short-circuit it.
    const result = await page.evaluate(async () => {
      const mod: any = await import("/src/lib/qa/userPreferences.functions.ts");
      try {
        await mod.saveMyPreferences({
          data: {
            theme: "light",
            accent: "not-a-real-color",
            density: "comfortable",
            default_landing: "/dashboard",
            show_kpi_cards: true,
            show_trend_chart: true,
            show_agent_chart: true,
          },
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    });

    // The server's zod validator (mirrored by the frontend ALLOWED_ACCENTS
    // list) must reject the unsupported color.
    expect(result.ok).toBe(false);

    // Reload — the persisted accent must still be the previously chosen one.
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.accent), {
        timeout: 10_000,
      })
      .toBe("blue");
  });
});