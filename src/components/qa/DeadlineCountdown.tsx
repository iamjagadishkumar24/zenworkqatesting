import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRetests } from "@/lib/qa/retest";
import { useEnvironment } from "@/lib/qa/environment";
import { useQA } from "@/lib/qa/store";
import { deadlineInfo, sortByDeadline, TIER_CLASSES } from "@/lib/qa/deadline";

/**
 * Live countdown widget shown top-right of the dashboard for agents.
 * Ticks every second from the wall clock; deadline_at is computed
 * server-side so refresh / re-login keeps the timer accurate.
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

  if (currentUser?.role !== "agent" || myActive.length === 0) return null;

  const primary = myActive[0];
  const primaryInfo = deadlineInfo(primary.deadline_at, now);

  return (
    <Card
      className={cn(
        "w-full md:w-[340px] border bg-card/70 backdrop-blur shadow-lg",
        primaryInfo.isOverdue && "border-red-500/50",
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {primaryInfo.isOverdue ? (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            ) : (
              <Timer className="h-4 w-4" />
            )}
            Assigned Tasks
          </div>
          <Badge variant="secondary">{myActive.length}</Badge>
        </div>

        <Link to="/tasks/$taskId" params={{ taskId: primary.id }} className="block group">
          <p className="text-sm font-semibold truncate group-hover:underline">
            {primary.title || primary.id}
          </p>
          <div
            className={cn(
              "mt-2 rounded-md border px-3 py-2 text-center",
              TIER_CLASSES[primaryInfo.tier],
            )}
          >
            <div className="text-[10px] uppercase tracking-wide opacity-80">
              {primaryInfo.isOverdue ? "Overdue by" : "Time Remaining"}
            </div>
            <div className="text-lg font-mono font-bold tabular-nums">{primaryInfo.label}</div>
          </div>
        </Link>

        {myActive.length > 1 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Clock className="h-3 w-3" /> Upcoming
            </div>
            {myActive.slice(1, 4).map((r) => {
              const info = deadlineInfo(r.deadline_at, now);
              return (
                <Link
                  key={r.id}
                  to="/tasks/$taskId"
                  params={{ taskId: r.id }}
                  className="flex items-center justify-between gap-2 text-xs hover:bg-muted/50 rounded px-2 py-1"
                >
                  <span className="truncate flex-1">{r.title || r.id}</span>
                  <span
                    className={cn(
                      "font-mono tabular-nums px-1.5 py-0.5 rounded border text-[11px]",
                      TIER_CLASSES[info.tier],
                    )}
                  >
                    {info.isOverdue ? `+${info.shortLabel}` : info.shortLabel}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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
