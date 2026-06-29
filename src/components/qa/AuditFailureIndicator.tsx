import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  getAuditFailureSnapshot,
  subscribeToAuditFailures,
  clearAuditFailures,
  type AuditFailureSnapshot,
} from "@/lib/qa/auditFailures";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString();
  } catch {
    return String(ms);
  }
}

/**
 * Header indicator that becomes visible the moment any audit-log write fails.
 * Audit writes are best-effort (they must never block the primary action),
 * but a silent failure breaks the compliance trail. This badge replaces the
 * previous "console.warn into the void" behaviour with a persistent,
 * dismissable signal — visible only when there is at least one failure.
 */
export function AuditFailureIndicator({ adminOnly = true, isAdmin }: {
  adminOnly?: boolean;
  isAdmin: boolean;
}) {
  const [snap, setSnap] = useState<AuditFailureSnapshot>(() => getAuditFailureSnapshot());

  useEffect(() => subscribeToAuditFailures(setSnap), []);

  if (snap.totalCount === 0) return null;
  if (adminOnly && !isAdmin) return null;

  const scopes = Object.entries(snap.perScope).filter(([, n]) => n > 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="audit-failure-indicator"
          aria-label={`Audit log write failures: ${snap.totalCount}`}
          className={cn(
            "relative inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
            "bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/30",
            "hover:bg-destructive/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive",
          )}
        >
          <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
          <span>Audit {snap.totalCount}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Audit write failures</div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => clearAuditFailures()}
            data-testid="audit-failure-clear"
          >
            Clear
          </Button>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-1 text-xs">
          {scopes.map(([scope, count]) => (
            <div key={scope} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1">
              <span className="text-muted-foreground">{scope}</span>
              <span className="font-semibold">{count}</span>
            </div>
          ))}
        </div>
        <div className="max-h-48 space-y-1 overflow-y-auto text-xs">
          {snap.recent.map((e, i) => (
            <div key={`${e.at}-${i}`} className="rounded border border-border/60 p-1.5">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{e.scope}</span>
                <span>{formatTime(e.at)}</span>
              </div>
              <div className="break-words text-foreground">{e.message}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Audit logging is best-effort: the originating action still succeeds. These
          entries indicate a broken compliance trail and should be investigated.
        </p>
      </PopoverContent>
    </Popover>
  );
}