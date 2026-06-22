import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const invalidateQueries = vi.fn();
const removeChannel = vi.fn();
const subscribe = vi.fn(() => ({}));
const onFn = vi.fn(function (this: any) {
  return { subscribe };
});
const channelFn = vi.fn(() => ({ on: onFn }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: (...a: any[]) => channelFn(...a),
    removeChannel: (...a: any[]) => removeChannel(...a),
  },
}));

import { useRealtimeTable } from "./useRealtimeTable";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient();
  qc.invalidateQueries = invalidateQueries as any;
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useRealtimeTable", () => {
  beforeEach(() => {
    invalidateQueries.mockClear();
    removeChannel.mockClear();
    subscribe.mockClear();
    onFn.mockClear();
    channelFn.mockClear();
  });

  it("subscribes to channel and invalidates query on change", () => {
    renderHook(
      () =>
        useRealtimeTable({
          table: "defects",
          queryKey: ["defects"],
          filter: "user_id=eq.1",
        }),
      { wrapper },
    );
    expect(channelFn).toHaveBeenCalledWith(
      expect.stringContaining("rt:defects:user_id=eq.1"),
    );
    const [, cfg, cb] = onFn.mock.calls[0];
    expect(cfg).toMatchObject({
      event: "*",
      schema: "public",
      table: "defects",
      filter: "user_id=eq.1",
    });
    cb({});
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["defects"] });
    expect(subscribe).toHaveBeenCalled();
  });

  it("removes channel on unmount", () => {
    const { unmount } = renderHook(
      () => useRealtimeTable({ table: "defects", queryKey: ["d"] }),
      { wrapper },
    );
    unmount();
    expect(removeChannel).toHaveBeenCalled();
  });

  it("skips subscription when disabled", () => {
    renderHook(
      () => useRealtimeTable({ table: "defects", queryKey: ["d"], enabled: false }),
      { wrapper },
    );
    expect(channelFn).not.toHaveBeenCalled();
  });
});