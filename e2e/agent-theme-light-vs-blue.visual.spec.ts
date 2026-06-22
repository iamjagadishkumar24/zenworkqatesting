import { test, expect, type Page } from "@playwright/test";
import { AGENT, loginAgent, pickAccent } from "./agent-theme-helpers";

type Region = {
  key: string;
  selector: string;
  /** Optional opener run before snapshotting (e.g. open a dropdown). */
  open?: (page: Page) => Promise<void>;
  /** Optional locator override for the screenshot target (e.g. the popover). */
  target?: string;
};

const PAGES = [
  {
    path: "/dashboard",
    name: "dashboard",
    extraRegions: [
      {
        key: "kpi-tile",
        selector:
          'main a[href*="my-reported-errors"], main [data-testid="kpi-card"], main [class*="card"]:has([class*="gradient"])',
      },
    ],
  },
  {
    path: "/defects",
    name: "defects",
    extraRegions: [
      {
        key: "status-dropdown",
        selector:
          'main [data-testid="status-filter"], main [role="combobox"]:has-text("status"), main [role="combobox"]',
      },
      {
        key: "status-dropdown-open",
        selector:
          'main [data-testid="status-filter"], main [role="combobox"]:has-text("status"), main [role="combobox"]',
        open: async (page) => {
          const trigger = page
            .locator(
              'main [data-testid="status-filter"], main [role="combobox"]:has-text("status"), main [role="combobox"]',
            )
            .first();
          if ((await trigger.count()) === 0) return;
          await trigger.click();
          await page
            .locator('[role="listbox"], [role="menu"]')
            .first()
            .waitFor({ state: "visible", timeout: 3000 })
            .catch(() => {});
        },
        target: '[role="listbox"], [role="menu"]',
      },
    ],
  },
  {
    path: "/reports",
    name: "reports",
    extraRegions: [
      {
        key: "chart-highlight",
        selector:
          'main [data-testid="report-chart"], main .recharts-wrapper, main svg',
      },
    ],
  },
];

// Regions that visibly depend on `--primary` / `--gradient-primary` /
// `--ring` / `--sidebar-primary`. Selectors are intentionally broad so
// the spec doesn't break on minor markup tweaks; each one falls back to
// the page body if absent.
const REGIONS = [
  { key: "sidebar", selector: '[data-sidebar="sidebar"], aside, nav[role="navigation"]' },
  { key: "kpis", selector: 'main [class*="grid"]:has(a[href*="my-reported-errors"]), main' },
  { key: "primary-button", selector: 'main button.bg-primary, main [data-variant="default"], main' },
];

async function snapshotRegions(
  page: Page,
  label: string,
  pageName: string,
  extra: Region[] = [],
) {
  for (const r of [...REGIONS, ...extra]) {
    if (r.open) await r.open(page);
    const loc = page.locator(r.target ?? r.selector).first();
    if ((await loc.count()) === 0) continue;
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await expect(loc).toHaveScreenshot(`${label}-${pageName}-${r.key}.png`, {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
    });
    if (r.open) {
      await page.keyboard.press("Escape").catch(() => {});
    }
  }
}

async function focusFirstInteractive(page: Page) {
  // Tab to the first focusable control so the focus ring (which is
  // driven by `--ring`) is visible in the screenshot.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
}

test.describe("Visual: Light vs Blue accent across pages", () => {
  test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

  for (const accent of ["Blue", "Light"] as const) {
    test(`renders ${accent} accent regions`, async ({ page }) => {
      await loginAgent(page);
      await pickAccent(page, accent);

      for (const p of PAGES) {
        await page.goto(p.path, { waitUntil: "networkidle" });
        // Confirm the picked accent really took effect before snapping.
        await expect
          .poll(() => page.evaluate(() => document.documentElement.dataset.accent))
          .toBe(accent.toLowerCase());

        await focusFirstInteractive(page);
        await snapshotRegions(page, accent.toLowerCase(), p.name, p.extraRegions);
      }
    });
  }
});