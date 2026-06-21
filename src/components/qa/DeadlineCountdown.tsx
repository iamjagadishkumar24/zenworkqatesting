import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Timer, CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useRetests } from "@/lib/qa/retest";
import { useEnvironment } from "@/lib/qa/environment";
import { useQA } from "@/lib/qa/store";
import { deadlineInfo, sortByDeadline, TIER_CLASSES } from "@/lib/qa/deadline";

/**
 * Compact live deadline indicator shown top-right of the agent dashboard.
 * Ticks every second; click to expand a popover listing upcoming deadlines.
 */
export function DeadlineCountdown() {
  const { currentUser } = useQA();
  const { env } = useEnvironment();
  const { items } = useRetests();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const myActive = useMemo(() => {
    if (currentUser?.role !== "agent") return [];
    return sortByDeadline(
      items.filter(
        (r) =>
          r.assigned_agent_id === currentUser.id &&
          r.status !== "Completed" &&
          r.deadline_at &&
          (!env || r.environment === env),
      ),
    );
  }, [items, currentUser, env]);

  const now_ = now; // keep ref stable for memo deps below
  const rows = useMemo(
    () => myActive.slice(0, 8).map((r) => ({ r, info: deadlineInfo(r.deadline_at, now_) })),
    [myActive, now_],
  );

  if (currentUser?.role !== "agent") return null;

  if (myActive.length === 0) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
        aria-label="No active deadlines"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        No Active Deadlines
      </div>
    );
  }

  const primary = myActive[0];
  const primaryInfo = deadlineInfo(primary.deadline_at, now);
  const multiple = myActive.length > 1;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${myActive.length} active deadline${multiple ? "s" : ""}, nearest ${primaryInfo.shortLabel}`}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-all hover:shadow-md hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            TIER_CLASSES[primaryInfo.tier],
          )}
        >
          {primaryInfo.isOverdue ? (
            <AlertTriangle className="h-3.5 w-3.5" />
          ) : (
            <Timer className="h-3.5 w-3.5" />
          )}
          {multiple ? (
            <span className="flex items-center gap-1.5">
              <span>{myActive.length} Due</span>
              <span className="opacity-60">·</span>
              <span className="font-mono tabular-nums">{primaryInfo.shortLabel}</span>
            </span>
          ) : (
            <span className="font-mono tabular-nums">
              {primaryInfo.isOverdue ? `+${primaryInfo.shortLabel} Overdue` : `${primaryInfo.shortLabel} Left`}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> Upcoming Deadlines
          </div>
          <Badge variant="secondary">{myActive.length}</Badge>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {rows.map(({ r, info }) => (
            <Link
                key={r.id}
                to="/tasks/$taskId"
                params={{ taskId: r.id }}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate">{r.title || r.id}</span>
                <span
                  className={cn(
                    "rounded border px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
                    TIER_CLASSES[info.tier],
                  )}
                >
                  {info.isOverdue ? `+${info.shortLabel}` : info.shortLabel}
                </span>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Compact admin widget — counts tasks near deadline and overdue.
 * Renders only when there is at least one matching task.
 */
export function AdminDeadlineSummary() {
  const { currentUser } = useQA();
  const { env } = useEnvironment();
  const { items } = useRetests();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { nearDeadline, overdue } = useMemo(() => {
    const active = items.filter(
      (r) => r.status !== "Completed" && r.deadline_at && (!env || r.environment === env),
    );
    const near: typeof active = [];
    const over: typeof active = [];
    for (const r of active) {
      const info = deadlineInfo(r.deadline_at, now);
      if (info.isOverdue) over.push(r);
      else if (info.msRemaining < 24 * 3_600_000) near.push(r);
    }
    return { nearDeadline: sortByDeadline(near), overdue: sortByDeadline(over) };
  }, [items, env, now]);

  if (currentUser?.role !== "admin" || (nearDeadline.length === 0 && overdue.length === 0)) {
    return null;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 w-full md:w-[420px]">
      <Card className="border bg-card/70 backdrop-blur">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400">
            <Clock className="h-3.5 w-3.5" /> Near Deadline
          </div>
          <div className="mt-1 text-2xl font-bold">{nearDeadline.length}</div>
          <p className="text-[11px] text-muted-foreground">Less than 24h remaining</p>
        </CardContent>
      </Card>
      <Card className="border bg-card/70 backdrop-blur">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Overdue
          </div>
          <div className="mt-1 text-2xl font-bold">{overdue.length}</div>
          <p className="text-[11px] text-muted-foreground">Past their deadline</p>
        </CardContent>
      </Card>
    </div>
  );
}
