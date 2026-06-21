import { APP_BUILD_VERSION } from "./app-version";
import { reportLovableError } from "./lovable-error-reporting";

const VERSION_ENDPOINT = "/api/public/app-version";
const RELOAD_STORAGE_KEY = "zenwork:last-cache-bust-reload";
const VERSION_STORAGE_KEY = "zenwork:last-seen-build-version";
const CHECK_INTERVAL_MS = 60_000;
const RELOAD_COOLDOWN_MS = 30_000;

type VersionPayload = {
  version?: string;
};

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isEnabled() {
  return isBrowser() && import.meta.env.PROD;
}

export function isLikelyChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message} ${error.stack ?? ""}`
      : String(error ?? "");
  const lower = message.toLowerCase();
  return (
    lower.includes("failed to fetch dynamically imported module") ||
    lower.includes("dynamically imported module") ||
    lower.includes("importing a module script failed") ||
    lower.includes("chunkloaderror") ||
    lower.includes("loading chunk") ||
    lower.includes("load failed")
  );
}

async function unregisterStaleAppServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations.map(async (registration) => {
      const scriptURL =
        registration.active?.scriptURL ??
        registration.waiting?.scriptURL ??
        registration.installing?.scriptURL ??
        "";
      const scriptPath = scriptURL ? new URL(scriptURL).pathname : "";
      if (scriptPath === "/sw.js" || scriptPath === "/service-worker.js") {
        await registration.unregister();
      }
    }),
  );
}

async function deleteStaleAppShellCaches() {
  if (!("caches" in window)) return;
  const cacheNames = await caches.keys();
  const appShellCachePattern = /(^|[-_])(workbox|precache|runtime|vite-pwa)([-_]|$)/i;
  await Promise.allSettled(
    cacheNames
      .filter((name) => appShellCachePattern.test(name))
      .map((name) => caches.delete(name)),
  );
}

async function getLatestVersion(): Promise<string | null> {
  const url = new URL(VERSION_ENDPOINT, window.location.origin);
  url.searchParams.set("t", String(Date.now()));
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as VersionPayload;
  return typeof payload.version === "string" && payload.version.length > 0
    ? payload.version
    : null;
}

async function reloadWithFreshAppShell(version: string, reason: string) {
  const lastReload = Number(sessionStorage.getItem(RELOAD_STORAGE_KEY) ?? "0");
  if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return;
  sessionStorage.setItem(RELOAD_STORAGE_KEY, String(Date.now()));
  localStorage.setItem(VERSION_STORAGE_KEY, version);

  await Promise.allSettled([
    unregisterStaleAppServiceWorkers(),
    deleteStaleAppShellCaches(),
  ]);

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("__app_version", version);
  nextUrl.searchParams.set("__reload_reason", reason);
  window.location.replace(nextUrl.toString());
}

export async function checkForNewAppVersion(reason = "scheduled") {
  if (!isEnabled()) return false;
  try {
    const latestVersion = await getLatestVersion();
    if (!latestVersion) return false;
    localStorage.setItem(VERSION_STORAGE_KEY, latestVersion);
    if (latestVersion !== APP_BUILD_VERSION) {
      await reloadWithFreshAppShell(latestVersion, reason);
      return true;
    }
  } catch (error) {
    reportLovableError(error, { source: "app_version_check", reason });
  }
  return false;
}

export function recoverFromPossibleStaleBundle(error: unknown, reason = "chunk_error") {
  if (!isLikelyChunkLoadError(error)) return;
  void checkForNewAppVersion(reason);
}

export function installCacheBustingVersionCheck() {
  if (!isEnabled()) return () => undefined;

  localStorage.setItem(VERSION_STORAGE_KEY, APP_BUILD_VERSION);

  const onPreloadError = (event: Event) => {
    event.preventDefault();
    const payload = (event as CustomEvent).detail ?? event;
    recoverFromPossibleStaleBundle(payload, "vite_preload_error");
  };

  const onError = (event: ErrorEvent | Event) => {
    const target = event.target as HTMLElement | null;
    const source =
      target instanceof HTMLScriptElement || target instanceof HTMLLinkElement
        ? target.src || target.href
        : "";
    const error = (event as ErrorEvent).error ?? (event as ErrorEvent).message ?? source;
    if (isLikelyChunkLoadError(error) || /\.(js|mjs)(\?|$)/i.test(source)) {
      event.preventDefault();
      recoverFromPossibleStaleBundle(error || source, "asset_load_error");
    }
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    recoverFromPossibleStaleBundle(event.reason, "unhandled_chunk_rejection");
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void checkForNewAppVersion("visibility");
  };

  const onFocus = () => void checkForNewAppVersion("focus");

  window.addEventListener("vite:preloadError", onPreloadError);
  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onFocus);

  const initialTimer = window.setTimeout(() => void checkForNewAppVersion("startup"), 2_000);
  const interval = window.setInterval(
    () => void checkForNewAppVersion("interval"),
    CHECK_INTERVAL_MS,
  );

  return () => {
    window.clearTimeout(initialTimer);
    window.clearInterval(interval);
    window.removeEventListener("vite:preloadError", onPreloadError);
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onFocus);
  };
}
