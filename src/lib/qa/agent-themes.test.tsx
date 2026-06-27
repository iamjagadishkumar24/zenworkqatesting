import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---- Shared mocks (mirror prefs.persistence.test.tsx) -------------------
type AuthCallback = (event: string, session: { user: { id: string } } | null) => void;
let currentSession: { user: { id: string } } | null = null;
let authCallback: AuthCallback | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: currentSession } }),
      onAuthStateChange: (cb: AuthCallback) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));
let currentUser: { role: "admin" | "agent" } | null = { role: "agent" };
vi.mock("@/lib/qa/store", () => ({ useQA: () => ({ currentUser }) }));

import { usePrefs, type AdminPrefs } from "./prefs";

const flush = () => new Promise((r) => setTimeout(r, 0));
const AGENT_ACCENTS: AdminPrefs["accent"][] = [
  "light",
  "blue",
  "green",
  "purple",
  "orange",
  "pink",
  "grey",
  "teal",
];

beforeEach(() => {
  window.localStorage.clear();
  currentSession = null;
  authCallback = null;
  document.documentElement.removeAttribute("data-accent");
  document.documentElement.classList.remove("dark");
});

describe("Agent theme colors", () => {
  it("applies every accent instantly and persists the last pick across logout/login", async () => {
    currentUser = { role: "agent" };
    currentSession = { user: { id: "agent-1" } };
    const { result, unmount } = renderHook(() => usePrefs());
    await act(async () => {
      await flush();
    });

    // Cycle through all 8 themes; data-accent must update instantly so cards,
    // buttons, sidebar, badges (all driven by --primary / --sidebar-primary)
    // re-paint without a refresh.
    for (const accent of AGENT_ACCENTS) {
      act(() => result.current.update("accent", accent));
      expect(document.documentElement.dataset.accent).toBe(accent);
    }

    // Last pick was "teal" — persists in storage and is reapplied after a
    // remount that simulates logout/login.
    expect(JSON.parse(window.localStorage.getItem("qa.admin.prefs.v1:agent-1")!).accent).toBe(
      "teal",
    );
    unmount();
    document.documentElement.removeAttribute("data-accent");

    const second = renderHook(() => usePrefs());
    await act(async () => {
      await flush();
    });
    expect(second.result.current.prefs.accent).toBe("teal");
    expect(document.documentElement.dataset.accent).toBe("teal");
    second.unmount();
  });

  it("blocks admins from agent themes via tampered localStorage", async () => {
    currentUser = { role: "admin" };
    // Simulate URL/devtools tamper: force an agent accent into admin storage.
    window.localStorage.setItem(
      "qa.admin.prefs.v1:admin-1",
      JSON.stringify({ accent: "purple", theme: "dark" }),
    );
    currentSession = { user: { id: "admin-1" } };
    const { result, unmount } = renderHook(() => usePrefs());
    await act(async () => {
      await flush();
    });

    // Even if the stored value is "purple", the applied UI accent is clamped
    // back to the default "blue".
    expect(document.documentElement.dataset.accent).toBe("blue");

    // Programmatic update to an agent-only accent must also be ignored.
    act(() => result.current.update("accent", "orange"));
    expect(document.documentElement.dataset.accent).toBe("blue");
    unmount();
  });

  it("applies the same accent at the document root for every page (global inheritance)", async () => {
    // All app pages render under <html> via routes/__root.tsx; setting
    // data-accent on the root means Dashboard, 1099/990/2290 Forms,
    // Integrations, Defects, Reports, and Settings all inherit the same
    // accent through the CSS variable cascade.
    currentUser = { role: "agent" };
    currentSession = { user: { id: "agent-2" } };
    const { result, unmount } = renderHook(() => usePrefs());
    await act(async () => {
      await flush();
    });
    act(() => result.current.update("accent", "green"));
    expect(document.documentElement.dataset.accent).toBe("green");
    // CSS vars used by cards/buttons/sidebar/badges all key off :root.
    expect(document.documentElement).toBe(document.querySelector(":root"));
    unmount();
  });

  it("defines accessible color tokens for every agent theme (WCAG sanity)", () => {
    // Confirm each accent ships a complete token set (primary, glow, ring,
    // sidebar primary, gradient) so buttons, badges, links, and status pills
    // remain visible. The actual contrast ratios come from the oklch values;
    // this test guards against future deletions/typos that would leave a
    // theme partially styled and fail contrast.
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const REQUIRED = [
      "--primary",
      "--primary-glow",
      "--ring",
      "--sidebar-primary",
      "--gradient-primary",
    ];
    for (const accent of ["green", "purple", "orange", "pink", "grey", "teal"]) {
      const block = css.match(new RegExp(`:root\\[data-accent="${accent}"\\]\\s*\\{([^}]+)\\}`));
      expect(block, `missing CSS block for ${accent}`).not.toBeNull();
      for (const token of REQUIRED) {
        expect(block![1], `${accent} missing ${token}`).toContain(token);
      }
    }
  });
});
