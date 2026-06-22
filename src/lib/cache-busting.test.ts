import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./app-version", () => ({ APP_BUILD_VERSION: "v-current" }));
vi.mock("./lovable-error-reporting", () => ({ reportLovableError: vi.fn() }));

import {
  checkForNewAppVersion,
  installCacheBustingVersionCheck,
  isLikelyChunkLoadError,
  recoverFromPossibleStaleBundle,
} from "./cache-busting";

describe("isLikelyChunkLoadError", () => {
  it("recognises Vite/dynamic import phrasings", () => {
    expect(isLikelyChunkLoadError(new Error("Failed to fetch dynamically imported module foo"))).toBe(true);
    expect(isLikelyChunkLoadError(new Error("Importing a module script failed."))).toBe(true);
    expect(isLikelyChunkLoadError(new Error("ChunkLoadError: loading chunk 5 failed"))).toBe(true);
    expect(isLikelyChunkLoadError(new Error("Load failed"))).toBe(true);
  });
  it("returns false for unrelated errors and non-errors", () => {
    expect(isLikelyChunkLoadError(new Error("Database row not found"))).toBe(false);
    expect(isLikelyChunkLoadError(null)).toBe(false);
    expect(isLikelyChunkLoadError(undefined)).toBe(false);
    expect(isLikelyChunkLoadError("random string")).toBe(false);
  });
});

describe("checkForNewAppVersion", () => {
  const realFetch = globalThis.fetch;
  let replaceSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    replaceSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        href: "https://app.test/path",
        origin: "https://app.test",
        search: "",
        replace: replaceSpy,
      },
    });
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns false when the server reports the same version", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ version: "v-current" }), { status: 200 }),
    ) as typeof fetch;
    const reloaded = await checkForNewAppVersion("scheduled");
    expect(reloaded).toBe(false);
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("zenwork:last-seen-build-version")).toBe("v-current");
  });

  it("triggers a cache-busting reload when the version changes", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ version: "v-next" }), { status: 200 }),
    ) as typeof fetch;
    const reloaded = await checkForNewAppVersion("scheduled");
    expect(reloaded).toBe(true);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    const url = String(replaceSpy.mock.calls[0]![0]);
    expect(url).toContain("__app_version=v-next");
    expect(url).toContain("__reload_reason=scheduled");
    expect(window.sessionStorage.getItem("zenwork:last-cache-bust-reload")).not.toBeNull();
  });

  it("respects the reload cooldown window", async () => {
    window.sessionStorage.setItem(
      "zenwork:last-cache-bust-reload",
      String(Date.now()),
    );
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ version: "v-next" }), { status: 200 }),
    ) as typeof fetch;
    await checkForNewAppVersion("scheduled");
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("returns false and swallows errors on bad payloads", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("not json", { status: 200 }),
    ) as typeof fetch;
    await expect(checkForNewAppVersion("scheduled")).resolves.toBe(false);
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it("returns false when the endpoint is not ok", async () => {
    globalThis.fetch = vi.fn(async () => new Response("", { status: 500 })) as typeof fetch;
    await expect(checkForNewAppVersion("scheduled")).resolves.toBe(false);
  });
});

describe("recoverFromPossibleStaleBundle", () => {
  it("no-ops for non-chunk errors", () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));
    recoverFromPossibleStaleBundle(new Error("totally unrelated"));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("installCacheBustingVersionCheck", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ version: "v-current" }), { status: 200 }),
    ) as typeof fetch;
  });
  it("seeds the last-seen version and returns a cleanup function", () => {
    const cleanup = installCacheBustingVersionCheck();
    expect(window.localStorage.getItem("zenwork:last-seen-build-version")).toBe("v-current");
    expect(typeof cleanup).toBe("function");
    cleanup();
  });
});