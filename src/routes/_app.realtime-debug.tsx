import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio, Trash2, Activity, Clock, Wifi, RefreshCw, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_app/realtime-debug")({
  component: RealtimeDebugPage,
});

function RealtimeDebugPage() {
  const { realtimeEvents, clearRealtimeEvents, currentUser } = useQA();
  const role = currentUser?.role ?? "unknown";

  const [status, setStatus] = useState<string>("connecting");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [reconnectedBanner, setReconnectedBanner] = useState<string | null>(null);
  const prevStatusRef = useRef<string>("connecting");
  const badSinceRef = useRef<number | null>(null);
  const pingSentAtRef = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const isBad = (s: string) =>
    s === "closed" || s === "channel_error" || s === "timed_out" || s === "errored";
  const isGood = (s: string) => s === "subscribed" || s === "joined";

  const subscribeChannel = (manual = false) => {
    // Tear down any prior channel before creating a new one.
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const channel = supabase.channel(`rt-diagnostics-${Math.random().toString(36).slice(2, 8)}`, {
      config: { broadcast: { self: true } },
    });
    channelRef.current = channel;
    channel
      .on("broadcast", { event: "ping" }, () => {
        if (pingSentAtRef.current != null) {
          setLatencyMs(Math.round(performance.now() - pingSentAtRef.current));
          pingSentAtRef.current = null;
        }
      })
      .subscribe((s) => setStatus(String(s).toLowerCase()));
    if (manual) setReconnectCount((c) => c + 1);
    return channel;
  };

  // Detect status transitions for the banner + auto-recover timer.
  useEffect(() => {
    const prev = prevStatusRef.current;
    if (isBad(prev) && isGood(status)) {
      setReconnectedBanner(`Realtime reconnected at ${new Date().toLocaleTimeString()}`);
      const t = setTimeout(() => setReconnectedBanner(null), 4000);
      badSinceRef.current = null;
      prevStatusRef.current = status;
      return () => clearTimeout(t);
    }
    if (isBad(status)) {
      if (badSinceRef.current == null) badSinceRef.current = Date.now();
    } else if (isGood(status)) {
      badSinceRef.current = null;
    }
    prevStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    subscribeChannel();
    const ping = setInterval(() => {
      const ch = channelRef.current;
      if (!ch || ch.state !== "joined") return;
      pingSentAtRef.current = performance.now();
      void ch.send({ type: "broadcast", event: "ping", payload: { t: Date.now() } });
    }, 5000);
    // Auto-recover: if the diagnostics channel stays in a bad state for >7s,
    // recreate it. Supabase's socket also auto-reconnects underneath, but
    // tearing down + resubscribing the channel handles cases where the join
    // itself is wedged (e.g. after token refresh or RLS change).
    const recover = setInterval(() => {
      if (badSinceRef.current && Date.now() - badSinceRef.current > 7000) {
        badSinceRef.current = null;
        subscribeChannel(true);
      }
    }, 2000);
    // Browser back online → force an immediate resubscribe attempt.
    const onOnline = () => subscribeChannel(true);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(ping);
      clearInterval(recover);
      window.removeEventListener("online", onOnline);
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, []);

  const lastEventAt = realtimeEvents[0]?.at ?? null;
  const lastEventAgo = useTickingAgo(lastEventAt);
  const statusColor =
    status === "subscribed" || status === "joined"
      ? "bg-emerald-500"
      : status === "closed" || status === "channel_error" || status === "timed_out"
        ? "bg-red-500"
        : "bg-amber-500";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Radio className="h-5 w-5 text-emerald-500" /> Realtime Debug
          </h2>
          <p className="text-sm text-muted-foreground">
            Live stream of defect and comment events your role ({role}) is receiving via Supabase
            Realtime. RLS filters these per user — what you see here is exactly what your client is
            allowed to react to.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={clearRealtimeEvents}
          disabled={!realtimeEvents.length}
        >
          <Trash2 className="mr-2 h-4 w-4" /> Clear
        </Button>
      </div>

      {reconnectedBanner && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {reconnectedBanner}
        </div>
      )}
      {isBad(status) && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Realtime connection {status} — attempting to reconnect…
          </span>
          <Button size="sm" variant="outline" onClick={() => subscribeChannel(true)}>
            Retry now
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <Stat
            icon={<Wifi className="h-4 w-4" />}
            label="Subscription"
            value={
              <span className="inline-flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${statusColor}`} />
                {status}
              </span>
            }
          />
          <Stat
            icon={<Activity className="h-4 w-4" />}
            label="Latency"
            value={latencyMs == null ? "measuring…" : `${latencyMs} ms`}
          />
          <Stat
            icon={<Clock className="h-4 w-4" />}
            label="Last event"
            value={lastEventAgo ?? "none yet"}
          />
        </CardContent>
      </Card>
      {reconnectCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Resubscribed {reconnectCount} time{reconnectCount === 1 ? "" : "s"} this session.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {realtimeEvents.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Waiting for events… try changing a defect status or posting a comment in another tab.
            </div>
          ) : (
            <ul className="divide-y">
              {realtimeEvents.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(e.at).toLocaleTimeString()}
                  </span>
                  <Badge variant="outline">{e.table}</Badge>
                  <Badge
                    variant={
                      e.event === "INSERT"
                        ? "default"
                        : e.event === "DELETE"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {e.event}
                  </Badge>
                  <span className="flex-1 truncate">{e.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function useTickingAgo(iso: string | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!iso) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [iso]);
  if (!iso) return null;
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}
