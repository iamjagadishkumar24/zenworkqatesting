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

/**
 * Keyboard-only opener: focus the trigger, open via Enter (fall back to
 * Space), then move the active option with ArrowDown a few times.
 */
async function openStatusDropdownByKeyboard(page: Page, arrowDownPresses = 2) {
  const trigger = page.locator(TRIGGER_SELECTOR).first();
  if ((await trigger.count()) === 0) return;
  await page.keyboard.press("Escape").catch(() => {});
  await trigger.scrollIntoViewIfNeeded().catch(() => {});
  await trigger.focus();
  await page.keyboard.press("Enter");
  const popover = page.locator(POPOVER_SELECTOR).first();
  const visible = await popover
    .waitFor({ state: "visible", timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (!visible) {
    await page.keyboard.press("Space");
    await popover.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
  }
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
  for (let i = 0; i < arrowDownPresses; i++) {
    await page.keyboard.press("ArrowDown");
  }
  await page.evaluate(
    () =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      ),
  );
}

/**
 * Snapshot every option in the open status dropdown without closing it.
 * Walks the option list with ArrowDown, captures the popover after each
 * move so the `highlighted` (aria-selected / data-highlighted) row shifts.
 */
async function snapshotEachStatusOption(
  page: Page,
  label: string,
  pageName: string,
) {
  const trigger = page.locator(TRIGGER_SELECTOR).first();
  if ((await trigger.count()) === 0) return;
  await openStatusDropdownByKeyboard(page, 0);
  const popover = page.locator(POPOVER_SELECTOR).first();
  if ((await popover.count()) === 0) return;
  const optionCount = await popover
    .locator('[role="option"], [role="menuitem"]')
    .count();
  const max = Math.min(optionCount, 8); // cap to keep snapshots bounded
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("ArrowDown");
    // Wait for the highlighted row to settle (data-highlighted or aria-selected toggles).
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
        { timeout: 2000 },
      )
      .catch(() => {});
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        ),
    );
    await expect(popover).toHaveScreenshot(
      `${label}-${pageName}-status-option-${i + 1}.png`,
      { animations: "disabled", maxDiffPixelRatio: 0.02 },
    );
  }
  await page.keyboard.press("Escape").catch(() => {});
  await popover.waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});
}

/**
 * Snapshot the open listbox after Home / End / PageDown / PageUp presses.
 * PageUp/PageDown are captured opportunistically: if the widget doesn't
 * support them the highlighted row simply won't move, which is still a
 * valid visual baseline.
 */
async function snapshotStatusNavigationKeys(
  page: Page,
  label: string,
  pageName: string,
) {
  const trigger = page.locator(TRIGGER_SELECTOR).first();
  if ((await trigger.count()) === 0) return;
  await openStatusDropdownByKeyboard(page, 0);
  const popover = page.locator(POPOVER_SELECTOR).first();
  if ((await popover.count()) === 0) return;

  const keys = ["End", "Home", "PageDown", "PageUp"] as const;
  for (const key of keys) {
    await page.keyboard.press(key);
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
        { timeout: 2000 },
      )
      .catch(() => {});
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        ),
    );
    await expect(popover).toHaveScreenshot(
      `${label}-${pageName}-status-nav-${key.toLowerCase()}.png`,
      { animations: "disabled", maxDiffPixelRatio: 0.02 },
    );
  }
  await page.keyboard.press("Escape").catch(() => {});
  await popover.waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});
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
    afterRegions: async (page: Page, label: string, pageName: string) => {
      // Keyboard-driven open + ArrowDown highlight snapshot.
      await openStatusDropdownByKeyboard(page, 2);
      const popover = page.locator(POPOVER_SELECTOR).first();
      if ((await popover.count()) > 0) {
        await expect(popover).toHaveScreenshot(
          `${label}-${pageName}-status-dropdown-keyboard.png`,
          { animations: "disabled", maxDiffPixelRatio: 0.02 },
        );
        await page.keyboard.press("Escape").catch(() => {});
        await popover
          .waitFor({ state: "hidden", timeout: 2000 })
          .catch(() => {});
      }
      // Per-option highlight snapshots from the same open popover.
      await snapshotEachStatusOption(page, label, pageName);
      // Home / End / PageUp / PageDown highlight snapshots.
      await snapshotStatusNavigationKeys(page, label, pageName);
    },
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
        if ("afterRegions" in p && typeof p.afterRegions === "function") {
          await p.afterRegions(page, accent.toLowerCase(), p.name);
        }
      }
    });
  }
});