import "@testing-library/jest-dom/vitest";
import "vitest-axe/extend-expect";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "vitest-axe/matchers";
import { expect } from "vitest";

expect.extend(matchers);

declare module "vitest" {
  interface Assertion<T = unknown> extends matchers.AxeMatchers {
    _t?: T;
  }
  interface AsymmetricMatchersContaining extends matchers.AxeMatchers {}
}

afterEach(() => cleanup());

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
