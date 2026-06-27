import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

type NetEntry = {
  url: string;
  method: string;
  status?: number;
  ok?: boolean;
  durationMs?: number;
  at: string;
  error?: string;
};

const LAST_REQUESTS: NetEntry[] = [];
let fetchPatched = false;

function patchFetch() {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (
      init?.method || (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const start = performance.now();
    const at = new Date().toISOString();
    try {
      const res = await orig(input as RequestInfo, init);
      LAST_REQUESTS.unshift({
        url,
        method,
        status: res.status,
        ok: res.ok,
        durationMs: Math.round(performance.now() - start),
        at,
      });
      LAST_REQUESTS.length = Math.min(LAST_REQUESTS.length, 20);
      (window as Window).__lastNetworkRequest = LAST_REQUESTS[0];
      return res;
    } catch (err) {
      LAST_REQUESTS.unshift({
        url,
        method,
        at,
        durationMs: Math.round(performance.now() - start),
        error: err instanceof Error ? err.message : String(err),
      });
      LAST_REQUESTS.length = Math.min(LAST_REQUESTS.length, 20);
      (window as Window).__lastNetworkRequest = LAST_REQUESTS[0];
      throw err;
    }
  };
}

if (typeof window !== "undefined" && import.meta.env.DEV) {
  patchFetch();
}

export function DevErrorOverlay({ error }: { error: Error }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const [open, setOpen] = useState(true);

  useEffect(() => {
    patchFetch();
  }, []);

  if (!import.meta.env.DEV) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-3 right-3 z-[9999] rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
      >
        Show dev error
      </button>
    );
  }

  const lastReq = LAST_REQUESTS[0];

  return (
    <div className="fixed inset-x-3 bottom-3 z-[9999] max-h-[60vh] overflow-auto rounded-lg border border-red-500/40 bg-zinc-950/95 p-4 font-mono text-xs text-zinc-100 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
            Dev Error
          </span>
          <span className="text-red-300">
            {error.name}: {error.message}
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
        >
          Hide
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <section>
          <h3 className="mb-1 text-[10px] uppercase text-zinc-400">Route</h3>
          <div className="rounded bg-zinc-900 p-2">
            <div>
              <span className="text-zinc-500">path:</span> {pathname}
            </div>
            {search ? (
              <div>
                <span className="text-zinc-500">search:</span> {search}
              </div>
            ) : null}
          </div>
        </section>

        <section className="md:col-span-2">
          <h3 className="mb-1 text-[10px] uppercase text-zinc-400">Last request</h3>
          {lastReq ? (
            <div className="rounded bg-zinc-900 p-2">
              <div>
                <span className="text-zinc-500">{lastReq.method}</span>{" "}
                <span className={lastReq.ok ? "text-emerald-400" : "text-red-400"}>
                  {lastReq.status ?? "ERR"}
                </span>{" "}
                <span className="text-zinc-500">({lastReq.durationMs}ms)</span>
              </div>
              <div className="truncate">{lastReq.url}</div>
              {lastReq.error ? <div className="text-red-400">{lastReq.error}</div> : null}
              <div className="text-[10px] text-zinc-500">{lastReq.at}</div>
            </div>
          ) : (
            <div className="rounded bg-zinc-900 p-2 text-zinc-500">No requests captured.</div>
          )}
        </section>
      </div>

      <section className="mt-3">
        <h3 className="mb-1 text-[10px] uppercase text-zinc-400">Stack trace</h3>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-zinc-900 p-2 text-[11px] leading-relaxed text-zinc-200">
          {error.stack || "(no stack)"}
        </pre>
      </section>

      {LAST_REQUESTS.length > 1 ? (
        <section className="mt-3">
          <h3 className="mb-1 text-[10px] uppercase text-zinc-400">
            Recent network ({LAST_REQUESTS.length})
          </h3>
          <div className="max-h-40 overflow-auto rounded bg-zinc-900">
            {LAST_REQUESTS.slice(0, 10).map((r, i) => (
              <div key={i} className="flex gap-2 border-b border-zinc-800 px-2 py-1 last:border-0">
                <span className="w-12 text-zinc-500">{r.method}</span>
                <span className={`w-10 ${r.ok ? "text-emerald-400" : "text-red-400"}`}>
                  {r.status ?? "ERR"}
                </span>
                <span className="flex-1 truncate">{r.url}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
