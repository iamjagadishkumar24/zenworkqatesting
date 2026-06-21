import { createServerFn } from "@tanstack/react-start";

export type QARuntimeConfig = {
  /** When false, the QA store skips opening the Realtime channel entirely. */
  liveEnabled: boolean;
  /**
   * When true, the store batches all realtime-driven state updates inside a
   * single rAF frame to keep the UI smooth under heavy event load. The
   * feature is fully backend-driven — no UI control is exposed.
   */
  performanceMode: boolean;
};

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

/**
 * Public, unauthenticated config endpoint. Returning only two booleans is
 * intentional — no PII, no secrets — so RLS and bearer tokens aren't needed.
 * Set `LIVE_EXECUTION_ENABLED=false` to kill realtime fleet-wide.
 * Set `REALTIME_PERFORMANCE_MODE=true` to throttle realtime state writes.
 */
export const getQARuntimeConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<QARuntimeConfig> => ({
    liveEnabled: envBool("LIVE_EXECUTION_ENABLED", true),
    performanceMode: envBool("REALTIME_PERFORMANCE_MODE", false),
  }),
);