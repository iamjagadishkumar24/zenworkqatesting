/**
 * Regression test: after login, the realtime subscription must keep running
 * in the backend store, but NO user-visible indicator (toast, banner, badge,
 * tooltip) may surface its connect/disconnect/reconnect transitions.
 *
 * We verify two things without standing up the full QAProvider:
 *
 * 1. The dedicated UI surfaces (`RealtimeStatus`, `RealtimeHealthMenu`) are
 *    no-op components that render nothing.
 * 2. The store source still wires `.subscribe(...)` on a Supabase channel
 *    AND still calls `setRealtimeStatus("connected")`, while NOT calling
 *    `toast.error`/`toast.success` from the realtime status effect.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/assets/zenwork-logo.png.asset.json", () => ({
  default: { url: "https://cdn/test-logo.png" },
}));

import { RealtimeStatus } from "@/components/qa/RealtimeStatus";
import { RealtimeHealthMenu } from "@/components/qa/RealtimeHealthMenu";

const storeSource = readFileSync(resolve(__dirname, "store.tsx"), "utf8");

describe("realtime indicators are hidden post-login", () => {
  it("RealtimeStatus renders nothing", () => {
    const { container } = render(<RealtimeStatus />);
    expect(container.firstChild).toBeNull();
  });

  it("RealtimeHealthMenu renders nothing", () => {
    const { container } = render(<RealtimeHealthMenu />);
    expect(container.firstChild).toBeNull();
  });

  it("store still subscribes to realtime and tracks connected status", () => {
    expect(storeSource).toMatch(/\.subscribe\(/);
    expect(storeSource).toContain('setRealtimeStatus("connected")');
  });

  it("store does not toast on realtime status transitions", () => {
    // Toast import may still exist for unrelated flows, but the realtime
    // status effect must not invoke toast.error / toast.success with the
    // historic "Realtime disconnected" / "Realtime reconnected" copy.
    expect(storeSource).not.toMatch(/Realtime disconnected/);
    expect(storeSource).not.toMatch(/Realtime reconnected/);
    expect(storeSource).not.toMatch(/qa-realtime-status/);
  });
});
