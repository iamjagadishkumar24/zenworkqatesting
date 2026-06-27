import type { Page } from "@playwright/test";

export const AGENT = {
  email: process.env.PLAYWRIGHT_AGENT_EMAIL,
  password: process.env.PLAYWRIGHT_AGENT_PASSWORD,
};

export async function loginAgent(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(AGENT.email!);
  await page.getByLabel(/password/i).fill(AGENT.password!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

export async function logout(page: Page) {
  await page.evaluate(async () => {
    const { supabase } = await import("/src/integrations/supabase/client.ts");
    await supabase.auth.signOut();
    localStorage.clear();
  });
}

/**
 * Resolve theme tokens cross-browser. We render probe elements that
 * consume each CSS variable through a Tailwind-ish utility chain so
 * both Chromium and Firefox return normalized `rgb(...)` strings.
 */
export async function readTokens(page: Page) {
  return page.evaluate(() => {
    const make = (style: Partial<CSSStyleDeclaration>) => {
      const el = document.createElement("div");
      Object.assign(el.style, style);
      el.style.display = "none";
      document.body.appendChild(el);
      return el;
    };
    const primary = make({ color: "hsl(var(--primary))" });
    const ring = make({ color: "hsl(var(--ring))" });
    const sidebar = make({ color: "hsl(var(--sidebar-primary))" });
    const gradient = make({ background: "var(--gradient-primary)" });
    const out = {
      accent: document.documentElement.dataset.accent ?? "",
      primary: getComputedStyle(primary).color,
      ring: getComputedStyle(ring).color,
      sidebar: getComputedStyle(sidebar).color,
      // backgroundImage is the safest read of a gradient — Firefox
      // and Chromium both serialize gradients to `linear-gradient(...)`.
      gradient: getComputedStyle(gradient).backgroundImage,
    };
    [primary, ring, sidebar, gradient].forEach((n) => n.remove());
    return out;
  });
}

export async function pickAccent(page: Page, label: string) {
  await page.goto("/settings");
  await page.getByRole("radio", { name: new RegExp(`${label} theme`, "i") }).click();
  await page
    .waitForFunction((l) => document.documentElement.dataset.accent === l, label.toLowerCase(), {
      timeout: 5000,
    })
    .catch(() => {});
}
