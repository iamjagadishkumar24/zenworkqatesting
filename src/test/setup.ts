import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "vitest-axe/matchers";
import { expect } from "vitest";

expect.extend(matchers);

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends matchers.AxeMatchers {}
  interface AsymmetricMatchersContaining extends matchers.AxeMatchers {}
}

afterEach(() => cleanup());

// Supabase realtime opens a WebSocket via undici in jsdom which occasionally
// emits an Event whose constructor identity check fails in Node's internal
// event_target (ERR_INVALID_ARG_TYPE: "Received an instance of Event"). It
// has no impact on the unit-under-test, but it surfaces as an unhandled
// exception and fails the suite — swallow only that specific symptom.
if (typeof process !== "undefined" && typeof process.on === "function") {
  process.on("uncaughtException", (err: unknown) => {
    const e = err as { code?: string; message?: string } | undefined;
    if (e && e.code === "ERR_INVALID_ARG_TYPE" && /instance of Event/.test(String(e.message))) {
      return;
    }
    throw err as Error;
  });
}

type Mutable = Record<string, unknown>;
const g = globalThis as unknown as Mutable;

if (!g.ResizeObserver) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom doesn't implement matchMedia
if (!window.matchMedia) {
  (window as unknown as Mutable).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}
