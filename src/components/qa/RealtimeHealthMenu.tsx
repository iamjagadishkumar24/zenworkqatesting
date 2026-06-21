/**
 * Realtime health dropdown — removed from the UI per product requirement.
 * Kept as a no-op so existing route imports keep compiling. Realtime itself
 * still runs in the QA store, gated by the backend `liveEnabled` toggle.
 */
export function RealtimeHealthMenu(_props: { className?: string }) {
  return null;
}
  const {
    realtimeStatus,
    realtimeChannelName,
    realtimeReconnectAttempts,
    realtimeLastEventAt,
  } = useQA();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Open realtime health details"
          className="appearance-none"
        >
          <RealtimeStatus className={className} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm">
        <div className="font-medium mb-2">Realtime health</div>
        <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Status</dt>
          <dd data-testid="rt-health-status" className="font-medium capitalize">
            {realtimeStatus}
          </dd>
          <dt className="text-muted-foreground">Channel</dt>
          <dd
            data-testid="rt-health-channel"
            className="font-mono break-all"
            title={realtimeChannelName ?? ""}
          >
            {realtimeChannelName ?? "—"}
          </dd>
          <dt className="text-muted-foreground">Last event</dt>
          <dd data-testid="rt-health-last-event">
            <span className="font-medium">{relative(realtimeLastEventAt, now)}</span>
            {realtimeLastEventAt ? (
              <div className="text-muted-foreground">
                {new Date(realtimeLastEventAt).toLocaleTimeString()}
              </div>
            ) : null}
          </dd>
          <dt className="text-muted-foreground">Reconnects</dt>
          <dd
            data-testid="rt-health-reconnects"
            className={
              realtimeReconnectAttempts > 0
                ? "font-semibold text-amber-600 dark:text-amber-400"
                : "font-medium"
            }
          >
            {realtimeReconnectAttempts}
          </dd>
        </dl>
      </PopoverContent>
    </Popover>
  );
}