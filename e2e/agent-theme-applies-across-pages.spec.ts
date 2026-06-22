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
  // Resolve the --primary token through a real element so Chromium and
  // Firefox both return a normalized `rgb(...)` / `oklch(...)` string.
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "hsl(var(--primary))";
    probe.style.display = "none";
    document.body.appendChild(probe);
    const primary = getComputedStyle(probe).color;
    probe.remove();
    return {
      accent: document.documentElement.dataset.accent,
      primary,
    };
  });
}

// Sample the resolved color of the first VISIBLE element matching any
// of the candidate selectors. Returns null when nothing matches so
// callers can skip pages that don't render a given primitive. Trying
// multiple selectors in order makes the assertions resilient to UI
// refactors (e.g. shadcn renaming `data-slot`, Tailwind class shuffles,
// or a page omitting one primitive entirely).
async function sampleColor(
  page: Page,
  selectors: string[],
  prop: "color" | "backgroundColor" | "borderTopColor",
) {
  for (const sel of selectors) {
    const loc = page.locator(sel).filter({ visible: true }).first();
    try {
      await loc.waitFor({ state: "visible", timeout: 1500 });
    } catch {
      continue;
    }
    return loc.evaluate(
      (el, p) => getComputedStyle(el as HTMLElement)[p as never] as string,
      prop,
    );
  }
  return null;
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

      // Primary button — try the shadcn default variant, then any
      // element using the `bg-primary` token, then a role-based fallback
      // restricted to buttons that actually render on the accent.
      const btnBg = await sampleColor(
        page,
        [
          'button[data-variant="default"]',
          'button.bg-primary',
          '[data-slot="button"].bg-primary',
          'a.bg-primary',
        ],
         "backgroundColor",
       );
      if (btnBg) expect(btnBg).toBe(baseline.primary);

      // Table headers / accent text — only assert when an element
      // actively opts into the primary color. Role-based `columnheader`
      // is the most stable handle when present.
      const accentText = await sampleColor(
        page,
        [
          'th.text-primary',
          '[role="columnheader"].text-primary',
          '.text-primary',
          '[data-accent-text="true"]',
        ],
        "color",
      );
      if (accentText) expect(accentText).toBe(baseline.primary);

      // Badge primary variant — prefer the shadcn slot attribute, fall
      // back to class-based and role-based matches.
      const badgeBg = await sampleColor(
        page,
        [
          '[data-slot="badge"].bg-primary',
          'span.bg-primary[class*="rounded"]',
          '[role="status"].bg-primary',
          '.badge.bg-primary',
        ],
        "backgroundColor",
      );
      if (badgeBg) expect(badgeBg).toBe(baseline.primary);
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