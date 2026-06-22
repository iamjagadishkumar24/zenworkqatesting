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

async function readAccent(page: Page) {
  return page.evaluate(() => ({
    accent: document.documentElement.dataset.accent,
    // Primary color drives KPI gradients, module card icons, defects badges.
    primary: getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim(),
  }));
}

test.describe("Agent accent applies across pages after refresh", () => {
  test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

  test("KPI cards, module cards, and defects list reflect chosen accent", async ({ page }) => {
    await login(page, AGENT.email!, AGENT.password!);

    // Pick a distinctive accent.
    await page.goto("/settings");
    await page.getByRole("radio", { name: /green theme/i }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.accent))
      .toBe("green");

    // Snapshot the resolved primary token after server upsert.
    const baseline = await readAccent(page);
    expect(baseline.accent).toBe("green");
    expect(baseline.primary.length).toBeGreaterThan(0);

    for (const path of ["/dashboard", "/defects", "/reports"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset.accent), {
          timeout: 10_000,
        })
        .toBe("green");

      const now = await readAccent(page);
      expect(now.primary).toBe(baseline.primary);
    }

    // Dashboard: KPI gradient + module card icon use var(--gradient-primary)
    // / var(--primary). Sample a KPI card icon background.
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    const kpiBg = await page
      .locator('a[href*="my-reported-errors"] .rounded-lg[style*="gradient"]')
      .first()
      .evaluate((el) => (el as HTMLElement).style.background);
    expect(kpiBg).toMatch(/gradient-primary/);

    // Defects list page renders with accent applied.
    await page.goto("/defects", { waitUntil: "networkidle" });
    const defectsAccent = await page.evaluate(
      () => document.documentElement.dataset.accent,
    );
    expect(defectsAccent).toBe("green");
  });
});