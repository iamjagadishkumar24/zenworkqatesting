import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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

for (const theme of AGENT_THEMES) {
  test(`a11y contrast: ${theme}`, async ({ page, context }) => {
    await context.addInitScript((t) => {
      try {
        const raw = localStorage.getItem("zenwork.prefs");
        const prev = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          "zenwork.prefs",
          JSON.stringify({ ...prev, accent: t, theme: "light" }),
        );
      } catch {}
    }, theme);

    await page.goto("/", { waitUntil: "networkidle" });

    const results = await new AxeBuilder({ page }).withTags(["wcag2aa"]).include("body").analyze();

    const contrast = results.violations.filter((v) => v.id === "color-contrast");
    expect(contrast, JSON.stringify(contrast, null, 2)).toEqual([]);
  });
}
