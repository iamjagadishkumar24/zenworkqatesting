import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useQA } from "@/lib/qa/store";

type N = {
  id: string;
  at: string;
  defectId: string;
  title: string;
  detail: string;
};

const READ_KEY = "zw.notif.readAt.v1";

export function NotificationsBell() {
  const { defects, audit, currentUser } = useQA();
  const navigate = useNavigate();
  const [readAt, setReadAt] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem(READ_KEY) ?? 0);
  });
  const [open, setOpen] = useState(false);

  const items: N[] = useMemo(() => {
    if (!currentUser) return [];
    const me = currentUser.name;
    const myDefectIds = new Set(
      defects.filter((d) => d.assignedAgent === me || d.createdBy === me).map((d) => d.id),
    );
    const byId = new Map(defects.map((d) => [d.id, d] as const));
    const events: N[] = [];
    audit.forEach((a) => {
      if (!myDefectIds.has(a.defectId)) return;
      const d = byId.get(a.defectId);
      if (!d) return;
      const field = a.field.replace(/_/g, " ");
      events.push({
        id: `a-${a.id}`, at: a.changedAt, defectId: a.defectId,
        title: `${d.id} • ${field} changed`,
        detail: `${a.oldValue ?? "—"} → ${a.newValue ?? "—"} by ${a.changedBy}`,
      });
    });
    defects.forEach((d) => {
      if (!myDefectIds.has(d.id)) return;
      d.comments.forEach((c) => {
        if (c.author === me) return;
        events.push({
          id: `c-${c.id}`, at: c.createdAt, defectId: d.id,
          title: `New comment on ${d.id}`,
          detail: `${c.author}: ${c.text.slice(0, 120)}`,
        });
      });
      // newly assigned
      if (d.assignedAgent === me && d.createdBy !== me) {
        events.push({
          id: `assign-${d.id}`, at: d.updatedAt, defectId: d.id,
          title: `Assigned to you: ${d.id}`,
          detail: d.title,
        });
      }
    });
    // dedupe by id
    const seen = new Set<string>();
    return events
      .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 30);
  }, [defects, audit, currentUser]);

  const unread = items.filter((i) => +new Date(i.at) > readAt).length;

  useEffect(() => {
    if (open && unread > 0) {
      const now = Date.now();
      setReadAt(now);
      try { localStorage.setItem(READ_KEY, String(now)); } catch { /* ignore */ }
    }
  }, [open, unread]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const now = Date.now();
                setReadAt(now);
                try { localStorage.setItem(READ_KEY, String(now)); } catch { /* ignore */ }
              }}
            ><CheckCheck className="mr-1 h-3 w-3" /> Mark all read</Button>
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
                const isNew = +new Date(n.at) > readAt;
                return (
                  <li key={n.id}>
                    <button
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-accent transition-colors"
                      onClick={() => {
                        setOpen(false);
                        navigate({ to: "/defects", search: { q: n.defectId } as never });
                      }}
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isNew ? "bg-primary" : "bg-transparent"}`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{n.detail}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {new Date(n.at).toLocaleString()}
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