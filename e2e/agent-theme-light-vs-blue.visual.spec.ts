import { test, expect, type Page } from "@playwright/test";
import { AGENT, loginAgent, pickAccent } from "./agent-theme-helpers";

type Region = {
  key: string;
  selector: string;
  /** Optional opener run before snapshotting (e.g. open a dropdown). */
  open?: (page: Page) => Promise<void>;
  /** Optional locator override for the screenshot target (e.g. the popover). */
  target?: string;
  /** Optional pre-step (e.g. scroll the page) run before `open`. */
  prepare?: (page: Page) => Promise<void>;
};

const TRIGGER_SELECTOR =
  'main [data-testid="status-filter"], main [role="combobox"]:has-text("status"), main [role="combobox"]';
const POPOVER_SELECTOR =
  '[role="listbox"]:visible, [role="menu"]:visible, [data-radix-popper-content-wrapper] [role="listbox"], [data-radix-popper-content-wrapper] [role="menu"]';

async function openStatusDropdown(page: Page) {
  const trigger = page.locator(TRIGGER_SELECTOR).first();
  if ((await trigger.count()) === 0) return;
  // Ensure no stale popover is open.
  await page.keyboard.press("Escape").catch(() => {});
  await trigger.scrollIntoViewIfNeeded().catch(() => {});
  await trigger.click();
  const popover = page.locator(POPOVER_SELECTOR).first();
  await popover.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  // Wait for the popover to settle: stable bounding box across two frames
  // and no in-flight CSS animations/transitions on it or its descendants.
  await page
    .waitForFunction(
      (sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) return false;
        const anims = el.getAnimations({ subtree: true });
        return anims.every(
          (a) => a.playState === "finished" || a.playState === "idle",
        );
      },
      POPOVER_SELECTOR,
      { timeout: 3000 },
    )
    .catch(() => {});
  // Two RAFs to let layout/paint settle.
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
}

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
        selector: TRIGGER_SELECTOR,
      },
      {
        key: "status-dropdown-open",
        selector: TRIGGER_SELECTOR,
        prepare: async (page) => {
          await page.evaluate(() => window.scrollTo(0, 0));
        },
        open: openStatusDropdown,
        target: POPOVER_SELECTOR,
      },
      {
        key: "status-dropdown-open-scrolled-mid",
        selector: TRIGGER_SELECTOR,
        prepare: async (page) => {
          await page.evaluate(() =>
            window.scrollTo({ top: Math.round(document.body.scrollHeight / 3), behavior: "instant" as ScrollBehavior }),
          );
        },
        open: openStatusDropdown,
        target: POPOVER_SELECTOR,
      },
      {
        key: "status-dropdown-open-scrolled-bottom",
        selector: TRIGGER_SELECTOR,
        prepare: async (page) => {
          await page.evaluate(() =>
            window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" as ScrollBehavior }),
          );
        },
        open: openStatusDropdown,
        target: POPOVER_SELECTOR,
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
    if (r.prepare) await r.prepare(page);
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
      await page
        .locator(POPOVER_SELECTOR)
        .first()
        .waitFor({ state: "hidden", timeout: 2000 })
        .catch(() => {});
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