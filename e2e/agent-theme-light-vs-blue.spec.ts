import { test, expect } from "@playwright/test";
import { AGENT, loginAgent, pickAccent, readTokens } from "./agent-theme-helpers";

test.describe("Agent: Light accent is visually distinct from Blue", () => {
  test.skip(!AGENT.email || !AGENT.password, "agent creds not configured");

  test("KPI gradient, primary, ring, sidebar differ after refresh", async ({ page }) => {
    await loginAgent(page);

    await pickAccent(page, "Blue");
    const blueTokens: Record<string, Awaited<ReturnType<typeof readTokens>>> = {};
    for (const path of ["/dashboard", "/defects", "/reports"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      blueTokens[path] = await readTokens(page);
      expect(blueTokens[path].accent).toBe("blue");
    }

    await pickAccent(page, "Light");
    for (const path of ["/dashboard", "/defects", "/reports"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      const t = await readTokens(page);
      expect(t.accent).toBe("light");
      // Each token must differ from the Blue baseline on the same page.
      expect(t.primary, `primary on ${path}`).not.toBe(blueTokens[path].primary);
      expect(t.ring, `ring on ${path}`).not.toBe(blueTokens[path].ring);
      expect(t.sidebar, `sidebar on ${path}`).not.toBe(blueTokens[path].sidebar);
      expect(t.gradient, `gradient on ${path}`).not.toBe(blueTokens[path].gradient);
    }
  });
});