import { test, expect } from "@playwright/test";

const AGENT_THEMES = [
  "light",
  "blue",
  "green",
  "purple",
  "orange",
  "pink",
  "grey",
  "teal",
] as const;

const PAGES = [
  "/",
  "/1099-forms",
  "/990-forms",
  "/integrations",
  "/1099-online",
  "/defects",
  "/reports",
  "/settings",
];

for (const theme of AGENT_THEMES) {
  test.describe(`Agent theme: ${theme}`, () => {
    test.beforeEach(async ({ page, context }) => {
      await context.addInitScript((t) => {
        try {
          const raw = localStorage.getItem("zenwork.prefs");
          const prev = raw ? JSON.parse(raw) : {};
          localStorage.setItem(
            "zenwork.prefs",
            JSON.stringify({ ...prev, accent: t, theme: "light" }),
          );
        } catch {
          /* ignore — best-effort prefs seed */
        }
      }, theme);
    });

    for (const path of PAGES) {
      test(`renders ${path}`, async ({ page }) => {
        await page.goto(path, { waitUntil: "networkidle" });
        await expect(page).toHaveScreenshot(`${theme}${path.replace(/\//g, "_") || "_root"}.png`, {
          fullPage: true,
          animations: "disabled",
        });
      });
    }
  });
}
