import { test, expect, type Page } from "@playwright/test";
import { AGENT, loginAgent, pickAccent } from "./agent-theme-helpers";

/**
 * Verifies every available theme accent updates the key UI areas
 * (sidebar, header, buttons, cards, tables, forms, charts, badges,
 * alerts, modals, dropdowns) consistently — no partial fallback styles
 * (e.g. an area still showing the default blue after switching to pink).
 *
 * Strategy: render hidden probe elements that consume the same CSS
 * variables/utility classes those UI areas use, then assert each probe
 * resolves to a non-empty computed color AND tracks the accent change
 * (i.e. is not pinned to a single value across all accents).
 */

const SWATCHES: { label: string; token: string }[] = [
  { label: "Light", token: "light" },
  { label: "Blue", token: "blue" },
  { label: "Green", token: "green" },
  { label: "Emerald", token: "emerald" },
  { label: "Teal", token: "teal" },
  { label: "Purple", token: "purple" },
  { label: "Violet", token: "violet" },
  { label: "Pink", token: "pink" },
  { label: "Rose", token: "rose" },
  { label: "Orange", token: "orange" },
  { label: "Grey", token: "grey" },
];

type AreaSample = Record<string, string>;

async function sampleUiAreas(page: Page): Promise<AreaSample> {
  return page.evaluate(() => {
    // Tokens in this project are full `oklch(...)` values, NOT HSL triples,
    // so probes must reference them with `var(--token)` directly — wrapping
    // in `hsl(var(--token))` would produce an invalid color that silently
    // falls back to the default and makes every accent look identical.
    const probes: Record<string, Partial<CSSStyleDeclaration>> = {
      sidebar: { background: "var(--sidebar-primary)" },
      sidebarFg: { color: "var(--sidebar-primary-foreground)" },
      header: { background: "var(--background)", color: "var(--foreground)" },
      buttonBg: { background: "var(--primary)" },
      buttonFg: { color: "var(--primary-foreground)" },
      card: { background: "var(--card)", color: "var(--card-foreground)" },
      cardBorder: { borderColor: "var(--border)", borderStyle: "solid", borderWidth: "1px" },
      tableHead: { background: "var(--muted)", color: "var(--muted-foreground)" },
      tableRowBorder: { borderColor: "var(--border)", borderStyle: "solid", borderWidth: "1px" },
      formInputBorder: { borderColor: "var(--input)", borderStyle: "solid", borderWidth: "1px" },
      formRing: { outlineColor: "var(--ring)", outlineStyle: "solid", outlineWidth: "2px" },
      chartLine: { color: "var(--primary)" },
      chartGradient: { background: "var(--gradient-primary)" },
      badge: { background: "var(--primary)", color: "var(--primary-foreground)" },
      badgeSecondary: { background: "var(--secondary)", color: "var(--secondary-foreground)" },
      alertBg: { background: "var(--accent)", color: "var(--accent-foreground)" },
      alertDestructive: { background: "var(--destructive)", color: "var(--destructive-foreground)" },
      modalBg: { background: "var(--popover)", color: "var(--popover-foreground)" },
      modalRing: { outlineColor: "var(--ring)", outlineStyle: "solid", outlineWidth: "2px" },
      dropdownBg: { background: "var(--popover)", color: "var(--popover-foreground)" },
      dropdownAccent: { background: "var(--accent)" },
    };

    const made: HTMLElement[] = [];
    const sample: Record<string, string> = {};
    for (const [key, style] of Object.entries(probes)) {
      const el = document.createElement("div");
      Object.assign(el.style, style);
      el.style.position = "absolute";
      el.style.left = "-9999px";
      el.style.width = "10px";
      el.style.height = "10px";
      document.body.appendChild(el);
      made.push(el);
      const cs = getComputedStyle(el);
      // Pack the meaningful resolved values into a single string per probe so
      // we can both check non-emptiness and detect "stuck" surfaces across accents.
      sample[key] = [
        cs.backgroundColor,
        cs.color,
        cs.borderColor,
        cs.outlineColor,
        cs.backgroundImage,
      ]
        .filter((v) => v && v !== "rgba(0, 0, 0, 0)" && v !== "none")
        .join(" | ");
    }
    made.forEach((n) => n.remove());
    sample.accent = document.documentElement.dataset.accent ?? "";
    return sample;
  });
}

// Surfaces that MUST visibly change as the accent changes. Neutral surfaces
// (card bg, modal bg, table head, form input border) intentionally don't
// vary in light mode and are only asserted as non-empty.
const ACCENT_DRIVEN_KEYS = [
  "sidebar",
  "buttonBg",
  "chartLine",
  "chartGradient",
  "badge",
  "formRing",
  "modalRing",
];

const ALL_KEYS = [
  "sidebar",
  "sidebarFg",
  "header",
  "buttonBg",
  "buttonFg",
  "card",
  "cardBorder",
  "tableHead",
  "tableRowBorder",
  "formInputBorder",
  "formRing",
  "chartLine",
  "chartGradient",
  "badge",
  "badgeSecondary",
  "alertBg",
  "alertDestructive",
  "modalBg",
  "modalRing",
  "dropdownBg",
  "dropdownAccent",
];

test.describe("Theme accents: all key UI areas update without partial fallbacks", () => {
  test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

  test("every accent yields fully resolved tokens across sidebar/header/buttons/cards/tables/forms/charts/badges/alerts/modals/dropdowns", async ({
    page,
  }) => {
    await loginAgent(page);
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    const samples: Record<string, AreaSample> = {};

    for (const s of SWATCHES) {
      await pickAccent(page, s.label);
      // Give the CSS variable cascade a tick to settle.
      await page.waitForTimeout(150);
      const sample = await sampleUiAreas(page);
      expect(sample.accent, `data-accent for ${s.label}`).toBe(s.token);

      // Every probed surface must resolve to *something* — an empty string
      // means the variable didn't resolve, i.e. a partial fallback.
      for (const k of ALL_KEYS) {
        expect(sample[k], `${k} resolved for accent ${s.label}`).not.toBe("");
      }
      samples[s.token] = sample;
    }

    // No accent-driven surface should be identical across every accent —
    // that would mean the surface is stuck on a fallback color.
    for (const k of ACCENT_DRIVEN_KEYS) {
      const unique = new Set(SWATCHES.map((s) => samples[s.token][k]));
      expect(unique.size, `${k} varies across accents`).toBeGreaterThan(1);
    }

    // Cross-area consistency: when a given accent is active, the sidebar,
    // primary button, badge, and chart line should all derive from the same
    // --primary token. If one of them is "stuck" on the default while the
    // others updated, this would catch the partial fallback.
    for (const s of SWATCHES) {
      const sample = samples[s.token];
      // Extract first rgb(...) tuple from each accent-driven surface.
      const rgb = (v: string) => (v.match(/rgba?\([^)]+\)/) ?? [""])[0];
      const btn = rgb(sample.buttonBg);
      const sidebar = rgb(sample.sidebar);
      const badge = rgb(sample.badge);
      const chart = rgb(sample.chartLine);
      // Button background and badge background both come from --primary.
      expect(btn, `button vs badge for ${s.label}`).toBe(badge);
      // Chart line and button share --primary.
      expect(btn, `button vs chart for ${s.label}`).toBe(chart);
      // Sidebar uses --sidebar-primary which mirrors --primary for every
      // shipped accent, so it must also match.
      expect(sidebar, `sidebar vs button for ${s.label}`).toBe(btn);
    }
  });
});