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

/**
 * Tab / Shift+Tab focus movement within the open dropdown. Snapshots the
 * popover plus a small element-level focus snapshot of the currently
 * focused element (focus ring is driven by `--ring`).
 */
async function snapshotStatusTabFocus(
  page: Page,
  label: string,
  pageName: string,
) {
  const trigger = page.locator(TRIGGER_SELECTOR).first();
  if ((await trigger.count()) === 0) return;
  await openStatusDropdownByKeyboard(page, 0);
  const popover = page.locator(POPOVER_SELECTOR).first();
  if ((await popover.count()) === 0) return;

  const steps: Array<{ key: "Tab" | "Shift+Tab"; name: string }> = [
    { key: "Tab", name: "tab-1" },
    { key: "Tab", name: "tab-2" },
    { key: "Shift+Tab", name: "shifttab-1" },
    { key: "Shift+Tab", name: "shifttab-2" },
  ];
  for (const step of steps) {
    await page.keyboard.press(step.key);
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
    // Whole-popover snapshot to capture focus ring location.
    if ((await popover.count()) > 0) {
      await expect(popover).toHaveScreenshot(
        `${label}-${pageName}-status-${step.name}-popover.png`,
        { animations: "disabled", maxDiffPixelRatio: 0.02 },
      );
    }
    // Element-level snapshot of the currently focused control, if any.
    const focused = page.locator(":focus").first();
    if ((await focused.count()) > 0) {
      await expect(focused).toHaveScreenshot(
        `${label}-${pageName}-status-${step.name}-focused.png`,
        { animations: "disabled", maxDiffPixelRatio: 0.02 },
      );
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
  await popover.waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});
}

/**
 * Functional + visual check: Escape closes the open popover AND focus
 * returns to the trigger. Asserts hidden state and `:focus` identity,
 * then snapshots the trigger so the restored focus ring is captured.
 */
async function verifyEscapeReturnsFocusToTrigger(
  page: Page,
  label: string,
  pageName: string,
) {
  const trigger = page.locator(TRIGGER_SELECTOR).first();
  if ((await trigger.count()) === 0) return;
  await openStatusDropdownByKeyboard(page, 0);
  const popover = page.locator(POPOVER_SELECTOR).first();
  if ((await popover.count()) === 0) return;
  await expect(popover).toBeVisible();

  await page.keyboard.press("Escape");
  await popover.waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});
  await expect(popover).toBeHidden();

  // Focus should be back on the trigger.
  const triggerIsFocused = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    return !!el && el === document.activeElement;
  }, TRIGGER_SELECTOR);
  expect(triggerIsFocused).toBe(true);

  await trigger.scrollIntoViewIfNeeded().catch(() => {});
  await expect(trigger).toHaveScreenshot(
    `${label}-${pageName}-status-trigger-focus-restored.png`,
    { animations: "disabled", maxDiffPixelRatio: 0.02 },
  );
}

/**
 * Escape-from-position check: open the dropdown, move the active option to
 * `first` / `middle` / `last`, press Escape, and assert the popover closes
 * and focus returns to the trigger. Snapshots the restored trigger each
 * time so the focus ring color (driven by `--ring`) is captured per
 * position and per accent.
 */
async function verifyEscapeFromPositions(
  page: Page,
  label: string,
  pageName: string,
) {
  const trigger = page.locator(TRIGGER_SELECTOR).first();
  if ((await trigger.count()) === 0) return;

  const positions: Array<"first" | "middle" | "last"> = [
    "first",
    "middle",
    "last",
  ];
  for (const position of positions) {
    await openStatusDropdownByKeyboard(page, 0);
    const popover = page.locator(POPOVER_SELECTOR).first();
    if ((await popover.count()) === 0) continue;
    const optionCount = await popover
      .locator('[role="option"], [role="menuitem"]')
      .count();
    if (optionCount === 0) {
      await page.keyboard.press("Escape").catch(() => {});
      continue;
    }

    if (position === "first") {
      await page.keyboard.press("Home").catch(() => {});
      // Fallback for widgets that don't support Home.
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowUp");
    } else if (position === "last") {
      await page.keyboard.press("End").catch(() => {});
      for (let i = 0; i < optionCount + 2; i++) {
        await page.keyboard.press("ArrowDown");
      }
    } else {
      const mid = Math.max(1, Math.floor(optionCount / 2));
      for (let i = 0; i < mid; i++) {
        await page.keyboard.press("ArrowDown");
      }
    }
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        ),
    );

    await page.keyboard.press("Escape");
    await popover.waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});
    await expect(popover).toBeHidden();

    const triggerIsFocused = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      return !!el && el === document.activeElement;
    }, TRIGGER_SELECTOR);
    expect(triggerIsFocused, `focus restored after Escape from ${position}`).toBe(true);

    await trigger.scrollIntoViewIfNeeded().catch(() => {});
    await expect(trigger).toHaveScreenshot(
      `${label}-${pageName}-status-escape-from-${position}-trigger.png`,
      { animations: "disabled", maxDiffPixelRatio: 0.02 },
    );
  }
}

/**
 * Click-to-highlight check: open the dropdown, click an option that is
 * NOT the currently highlighted one, then re-open and assert that the
 * clicked option is now the active/selected row and that keyboard focus
 * inside the listbox lands on that same option. Snapshots the popover
 * before and after, and the focused option element.
 */
async function verifyClickHighlightsAndRestoresFocus(
  page: Page,
  label: string,
  pageName: string,
) {
  const trigger = page.locator(TRIGGER_SELECTOR).first();
  if ((await trigger.count()) === 0) return;

  await openStatusDropdown(page);
  let popover = page.locator(POPOVER_SELECTOR).first();
  if ((await popover.count()) === 0) return;
  const options = popover.locator('[role="option"], [role="menuitem"]');
  const optionCount = await options.count();
  if (optionCount < 2) {
    await page.keyboard.press("Escape").catch(() => {});
    return;
  }

  // Pick a target row that's deliberately different from index 0.
  const targetIndex = Math.min(optionCount - 1, Math.max(1, Math.floor(optionCount / 2)));
  const targetText = (await options.nth(targetIndex).innerText()).trim();

  // Baseline snapshot before click.
  await expect(popover).toHaveScreenshot(
    `${label}-${pageName}-status-click-before.png`,
    { animations: "disabled", maxDiffPixelRatio: 0.02 },
  );

  await options.nth(targetIndex).click();
  await popover.waitFor({ state: "hidden", timeout: 2000 }).catch(() => {});

  // Re-open and verify the clicked option is now highlighted / selected.
  await openStatusDropdownByKeyboard(page, 0);
  popover = page.locator(POPOVER_SELECTOR).first();
  if ((await popover.count()) === 0) return;

  const reopenedOptions = popover.locator('[role="option"], [role="menuitem"]');
  // Match by text to be resilient to reordering.
  const matchIndex = await reopenedOptions.evaluateAll(
    (els, text) =>
      els.findIndex((el) => (el.textContent || "").trim() === text),
    targetText,
  );
  expect(matchIndex, "clicked option still present after reopen").toBeGreaterThanOrEqual(0);

  const highlighted = popover
    .locator(
      '[role="option"][data-highlighted], [role="option"][aria-selected="true"], [role="option"][data-state="checked"], [role="menuitem"][data-highlighted]',
    )
    .first();
  if ((await highlighted.count()) > 0) {
    const highlightedText = (await highlighted.innerText()).trim();
    expect(highlightedText, "highlighted row matches clicked row").toBe(targetText);
  }

  // After snapshot — highlight should now be on the clicked row.
  await expect(popover).toHaveScreenshot(
    `${label}-${pageName}-status-click-after.png`,
    { animations: "disabled", maxDiffPixelRatio: 0.02 },
  );

  // Element-level snapshot of the focused option (focus ring uses `--ring`).
  const focusedOption = popover
    .locator('[role="option"]:focus, [role="menuitem"]:focus')
    .first();
  const focusTarget =
    (await focusedOption.count()) > 0
      ? focusedOption
      : matchIndex >= 0
        ? reopenedOptions.nth(matchIndex)
        : null;
  if (focusTarget) {
    await expect(focusTarget).toHaveScreenshot(
      `${label}-${pageName}-status-click-focused-option.png`,
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
      // Tab / Shift+Tab focus snapshots inside the open dropdown.
      await snapshotStatusTabFocus(page, label, pageName);
      // Escape closes popover and restores focus to the trigger.
      await verifyEscapeReturnsFocusToTrigger(page, label, pageName);
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