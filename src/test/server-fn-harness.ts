import { vi } from "vitest";

/**
 * Test harness that replaces `createServerFn` with a builder that exposes the
 * validator + handler so we can drive server functions directly under jsdom.
 *
 * Usage at the top of a test file:
 *
 *   vi.mock("@tanstack/react-start", async () => {
 *     const { createServerFnFactory } = await import("@/test/server-fn-harness");
 *     return { createServerFn: createServerFnFactory() };
 *   });
 *   vi.mock("@/integrations/supabase/auth-middleware", () => ({
 *     requireSupabaseAuth: { __mock: true },
 *   }));
 *
 * Then call any exported server fn as `await fn({ data, context })`. The
 * harness applies the inputValidator (so validation errors propagate) and
 * passes the rest straight through to the handler.
 */
export function createServerFnFactory() {
  return (_opts?: unknown) => {
    const state: {
      middleware: unknown[];
      validator: (d: unknown) => unknown;
      handler: ((args: { data: unknown; context: unknown }) => unknown) | null;
    } = { middleware: [], validator: (d) => d, handler: null };
    const api = {
      middleware(m: unknown[]) {
        state.middleware = m;
        return api;
      },
      inputValidator(v: (d: unknown) => unknown) {
        state.validator = v;
        return api;
      },
      handler(h: (args: { data: unknown; context: unknown }) => unknown) {
        state.handler = h;
        const fn = async (args: { data?: unknown; context?: unknown } = {}) => {
          const data = state.validator(args.data);
          return h({ data, context: args.context ?? {} });
        };
        (fn as unknown as { __validator: typeof state.validator }).__validator = state.validator;
        (fn as unknown as { __handler: typeof h }).__handler = h;
        (fn as unknown as { __middleware: unknown[] }).__middleware = state.middleware;
        return fn;
      },
    };
    return api;
  };
}

// Re-export vi so tests can do `import { vi } from "@/test/server-fn-harness"` if desired.
export { vi };