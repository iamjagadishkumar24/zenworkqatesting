import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listNotes, type NoteColor } from "@/lib/qa/notes.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StickyNote, Plus, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DOT: Record<NoteColor, string> = {
  yellow: "bg-amber-400",
  blue: "bg-sky-400",
  green: "bg-emerald-400",
  red: "bg-rose-400",
  purple: "bg-violet-400",
  grey: "bg-slate-400",
};

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function MyQuickNotesWidget() {
  const listFn = useServerFn(listNotes);
  const active = useQuery({
    queryKey: ["notes", { archived: false, search: "", tag: "" }],
    queryFn: () => listFn({ data: { archived: false, search: "", tag: "" } }),
  });
  const archived = useQuery({
    queryKey: ["notes", { archived: true, search: "", tag: "" }],
    queryFn: () => listFn({ data: { archived: true, search: "", tag: "" } }),
  });

  const activeNotes = active.data ?? [];
  const total = activeNotes.length + (archived.data?.length ?? 0);
  const recent = activeNotes.slice(0, 3);

  return (
    <Card className="h-full overflow-hidden border-border bg-card/70 backdrop-blur transition-all hover:shadow-[var(--shadow-elevated)]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg text-white" style={{ background: "var(--gradient-primary)" }}>
              <StickyNote className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">My Quick Notes</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Personal sticky notes</p>
            </div>
          </div>
          <Link to="/notes" className="text-xs font-medium text-primary inline-flex items-center gap-1">
            Open <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Total" value={total} />
          <Stat label="Active" value={activeNotes.length} />
          <Stat label="Archived" value={archived.data?.length ?? 0} />
        </div>

        <div className="mt-3 space-y-1.5">
          {active.isLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-7 animate-pulse rounded bg-muted/40" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">
              No notes yet. Create one to capture quick thoughts.
            </p>
          ) : (
            recent.map((n) => (
              <Link
                key={n.id}
                to="/notes"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[n.color])} />
                <span className="min-w-0 flex-1 truncate font-medium">{n.title || n.content_text || "Untitled"}</span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(n.updated_at)}</span>
              </Link>
            ))
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <Button asChild size="sm" className="flex-1">
            <Link to="/notes"><Plus className="h-3.5 w-3.5" /> New note</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="flex-1">
            <Link to="/notes">Open Notes</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background/40 px-2 py-1.5">
      <div className="text-base font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}