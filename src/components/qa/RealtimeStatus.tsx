import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQA } from "@/lib/qa/store";

/**
 * Tiny pill showing realtime channel health. Lets QA confirm at a glance
 * that dashboard counts will update without a refresh.
 */
export function RealtimeStatus({ className }: { className?: string }) {
  const { realtimeStatus } = useQA();

  const map = {
    idle: { label: "Realtime off", Icon: WifiOff, tone: "muted" },
    connecting: { label: "Connecting…", Icon: Loader2, tone: "amber" },
    connected: { label: "Live", Icon: Wifi, tone: "emerald" },
    reconnecting: { label: "Reconnecting…", Icon: Loader2, tone: "amber" },
    error: { label: "Realtime error", Icon: WifiOff, tone: "red" },
  } as const;

  const { label, Icon, tone } = map[realtimeStatus];
  const tones: Record<typeof tone, string> = {
    muted: "bg-muted text-muted-foreground border-border",
    amber: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
    red: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400",
  };

  const spinning = realtimeStatus === "connecting" || realtimeStatus === "reconnecting";

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Realtime status: ${label}`}
      data-realtime-status={realtimeStatus}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", spinning && "motion-safe:animate-spin")} />
      {label}
    </span>
  );
}