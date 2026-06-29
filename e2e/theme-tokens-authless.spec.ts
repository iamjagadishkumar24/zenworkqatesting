import { test, expect, type Page } from "@playwright/test";

/**
 * Authless theme-token regression. We don't need to log in — accent is just a
 * `data-accent` attribute on <html> and env is `data-env`. Toggling them on
 * any rendered page (we use /login since it's public) lets us read computed
 * CSS variables for the surfaces that drive header, sidebar, charts and
 * modals across every accent × env combo.
 */

const ACCENTS = [
  "light",
  "blue",
  "green",
  "emerald",
  "teal",
  "purple",
  "violet",
  "pink",
  "rose",
  "orange",
  "grey",
] as const;

const ENVS = ["", "Production", "Stage"] as const;

type Sample = {
  header: string; // --background
  sidebar: string; // --sidebar-primary
  chartLine: string; // --primary (used by chart strokes)
  chartGradient: string; // --gradient-primary
  modalBg: string; // --popover
  modalRing: string; // --ring
  primary: string;
};

async function readTokens(page: Page, accent: string, env: string): Promise<Sample> {
  return page.evaluate(
    ({ accent, env }) => {
      const root = document.documentElement;
      root.setAttribute("data-accent", accent);
      if (env) root.setAttribute("data-env", env);
      else root.removeAttribute("data-env");

      const make = (style: Partial<CSSStyleDeclaration>) => {
        const el = document.createElement("div");
        Object.assign(el.style, style);
        el.style.position = "absolute";
        el.style.left = "-9999px";
        el.style.width = "10px";
        el.style.height = "10px";
        document.body.appendChild(el);
        return el;
      };
      const probes = {
        header: make({ background: "var(--background)" }),
        sidebar: make({ background: "var(--sidebar-primary)" }),
        chartLine: make({ background: "var(--primary)" }),
        chartGradient: make({ background: "var(--gradient-primary)" }),
        modalBg: make({ background: "var(--popover)" }),
        modalRing: make({
          outlineColor: "var(--ring)",
          outlineStyle: "solid",
          outlineWidth: "2px",
        }),
        primary: make({ background: "var(--primary)" }),
      };
      const read = (el: HTMLElement, key: "backgroundColor" | "backgroundImage" | "outlineColor") =>
        getComputedStyle(el)[key];
      const out: Sample = {
        header: read(probes.header, "backgroundColor"),
        sidebar: read(probes.sidebar, "backgroundColor"),
        chartLine: read(probes.chartLine, "backgroundColor"),
        chartGradient: read(probes.chartGradient, "backgroundImage"),
        modalBg: read(probes.modalBg, "backgroundColor"),
        modalRing: read(probes.modalRing, "outlineColor"),
        primary: read(probes.primary, "backgroundColor"),
      };
      Object.values(probes).forEach((n) => n.remove());
      return out;
    },
    { accent, env },
  );
}

test.describe("Theme tokens (authless): every accent × env resolves header/sidebar/chart/modal", () => {
  test("tokens are non-empty and accent-driven surfaces vary per accent in each env", async ({
    page,
  }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    for (const env of ENVS) {
      const perEnv: Record<string, Sample> = {};
      for (const accent of ACCENTS) {
        const sample = await readTokens(page, accent, env);

        for (const [k, v] of Object.entries(sample)) {
          expect(v, `${k} resolved for accent=${accent} env=${env || "default"}`).toBeTruthy();
          expect(v, `${k} not transparent for accent=${accent} env=${env || "default"}`).not.toBe(
            "rgba(0, 0, 0, 0)",
          );
        }
        expect(
          sample.chartGradient,
          `gradient present for accent=${accent} env=${env || "default"}`,
        ).toMatch(/gradient/i);

        // Cross-surface consistency: sidebar, chart line, and primary all
        // derive from --primary and must match within a single accent.
        expect(sample.sidebar, `sidebar==primary for ${accent}/${env}`).toBe(sample.primary);
        expect(sample.chartLine, `chartLine==primary for ${accent}/${env}`).toBe(sample.primary);

        perEnv[accent] = sample;
      }

      // Accent-driven surfaces must produce distinct primaries — no accent
      // may collapse into another in this env.
      const primaries = new Set(ACCENTS.map((a) => perEnv[a].primary));
      expect(
        primaries.size,
        `distinct --primary across ${ACCENTS.length} accents in env=${env || "default"}`,
      ).toBe(ACCENTS.length);

      // Modal background (popover) and header background (page bg) are
      // neutral surfaces — they must resolve but should not be tinted by
      // the accent. Assert they are stable across accents within an env.
      const headers = new Set(ACCENTS.map((a) => perEnv[a].header));
      const modals = new Set(ACCENTS.map((a) => perEnv[a].modalBg));
      expect(headers.size, `header stable across accents in env=${env || "default"}`).toBe(1);
      expect(modals.size, `modal bg stable across accents in env=${env || "default"}`).toBe(1);
    }
  });

  test("Blue and Emerald override env tints (Production/Stage)", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const blueDefault = await readTokens(page, "blue", "");
    const emeraldDefault = await readTokens(page, "emerald", "");
    for (const env of ["Production", "Stage"] as const) {
      const blue = await readTokens(page, "blue", env);
      const emerald = await readTokens(page, "emerald", env);
      expect(blue.primary, `Blue stable under env=${env}`).toBe(blueDefault.primary);
      expect(emerald.primary, `Emerald stable under env=${env}`).toBe(emeraldDefault.primary);
      expect(blue.primary, `Blue != Emerald under env=${env}`).not.toBe(emerald.primary);
    }
  });
});