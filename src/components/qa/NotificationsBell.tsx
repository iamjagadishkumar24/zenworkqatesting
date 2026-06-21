import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { routeForNotification } from "@/lib/qa/notificationRouting";

export function NotificationsBell() {
  const { notifications, currentUser, markNotificationsRead } = useQA();
  const { env } = useEnvironment();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    if (!currentUser) return [];
    return notifications
      .filter((n) => !env || !n.environment || n.environment === env)
      .slice(0, 30);
  }, [notifications, currentUser, env]);

  const unread = items.filter((i) => !i.read).length;

  const markAll = () => {
    const ids = items.filter((i) => !i.read).map((i) => i.id);
    if (ids.length) void markNotificationsRead(ids);
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && unread > 0) markAll();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-accent transition-colors"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={markAll}>
              <CheckCheck className="mr-1 h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
            <BellOff className="h-6 w-6 opacity-50" />
            <p>You're all caught up.</p>
          </div>
        ) : (
          <ScrollArea className="h-80">
            <ul className="divide-y">
              {items.map((n) => {
                const isNew = !n.read;
                return (
                  <li key={n.id}>
                    <button
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                      onClick={() => {
                        setOpen(false);
                        if (!n.read) void markNotificationsRead([n.id]);
                        const target = routeForNotification(n);
                        navigate({ to: target.to, search: (target.search ?? {}) as never });
                      }}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isNew ? "bg-primary" : "bg-transparent"}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
