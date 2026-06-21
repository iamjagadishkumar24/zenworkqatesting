import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

// --- Mocks ----------------------------------------------------------------

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

let currentUser: { role: "admin" | "agent" } | null = { role: "admin" };
vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({ currentUser }),
}));

import { usePrefs } from "./prefs";

const flush = () => new Promise((r) => setTimeout(r, 0));
const signIn = async (uid: string) => {
  currentSession = { user: { id: uid } };
  await act(async () => {
    authCallback?.("SIGNED_IN", currentSession);
    await flush();
  });
};
const signOut = async () => {
  currentSession = null;
  await act(async () => {
    authCallback?.("SIGNED_OUT", null);
    await flush();
  });
};

describe("usePrefs per-user theme persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    currentSession = null;
    authCallback = null;
    currentUser = { role: "admin" };
  });

  it("persists an admin's theme across logout/login and isolates it per user", async () => {
    // Admin A signs in and switches to dark.
    currentSession = { user: { id: "admin-A" } };
    const { result, unmount } = renderHook(() => usePrefs());
    await act(async () => { await flush(); });

    act(() => result.current.update("theme", "dark"));
    expect(result.current.prefs.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Log out — admin A's preference must remain in storage.
    await signOut();
    unmount();
    expect(
      JSON.parse(window.localStorage.getItem("qa.admin.prefs.v1:admin-A")!).theme,
    ).toBe("dark");

    // A different user (admin B) signs in: must NOT inherit admin A's theme.
    currentSession = { user: { id: "admin-B" } };
    const second = renderHook(() => usePrefs());
    await act(async () => { await flush(); });
    expect(second.result.current.prefs.theme).toBe("light");
    second.unmount();

    // Admin A signs back in: their dark theme is restored.
    currentSession = { user: { id: "admin-A" } };
    const third = renderHook(() => usePrefs());
    await act(async () => { await flush(); });
    expect(third.result.current.prefs.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Admin B's stored prefs were never overwritten by admin A.
    expect(window.localStorage.getItem("qa.admin.prefs.v1:admin-B")).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem("qa.admin.prefs.v1:admin-B")!).theme,
    ).toBe("light");
    third.unmount();
  });
});