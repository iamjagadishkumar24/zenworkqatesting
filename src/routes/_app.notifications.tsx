import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BellOff, CheckCheck } from "lucide-react";
import { routeForNotification } from "@/lib/qa/notificationRouting";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const { notifications, markNotificationsRead } = useQA();
  const { env } = useEnvironment();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "unread" | "task" | "error">("all");

  const scoped = useMemo(
    () =>
      notifications.filter((n) => {
        if (env && n.environment && n.environment !== env) return false;
        if (filter === "unread" && n.read) return false;
        if (filter === "task" && !n.type?.startsWith("retest_")) return false;
        if (filter === "error" && n.type?.startsWith("retest_")) return false;
        return true;
      }),
    [notifications, env, filter],
  );
  const unreadIds = useMemo(() => scoped.filter((n) => !n.read).map((n) => n.id), [scoped]);

  useEffect(() => {
    // Auto-mark visible notifications read after a short delay
    if (!unreadIds.length) return;
    const t = setTimeout(() => {
      void markNotificationsRead(unreadIds);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadIds.join("|")]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
          <p className="text-sm text-muted-foreground">
            Defect assignments, status changes, comments and validation results.
            {env && (
              <>
                {" "}
                Filtered to{" "}
                <Badge variant="outline" className="ml-1">
                  {env}
                </Badge>
              </>
            )}
          </p>
        </div>
        {unreadIds.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => markNotificationsRead(unreadIds)}>
            <CheckCheck className="mr-1 h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["all", "All"],
            ["unread", "Unread"],
            ["task", "Tasks"],
            ["error", "Error updates"],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={filter === k ? "default" : "outline"}
            className={cn("h-7 px-3 text-xs")}
            onClick={() => setFilter(k)}
          >
            {label}
          </Button>
        ))}
      </div>

      {scoped.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <BellOff className="h-8 w-8 opacity-50" />
            You're all caught up.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {scoped.map((n) => (
                <li key={n.id}>
                  <button
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                    onClick={() => {
                      const t = routeForNotification(n);
                      navigate({ to: t.to, search: (t.search ?? {}) as never });
                    }}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-primary"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{n.title}</p>
                        {n.environment && (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {n.environment}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{n.body}</p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {new Date(n.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
