import { createFileRoute } from "@tanstack/react-router";
import { useQA } from "@/lib/qa/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Radio, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/realtime-debug")({
  component: RealtimeDebugPage,
});

function RealtimeDebugPage() {
  const { realtimeEvents, clearRealtimeEvents, currentUser } = useQA();
  const role = currentUser?.role ?? "unknown";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Radio className="h-5 w-5 text-emerald-500" /> Realtime Debug
          </h2>
          <p className="text-sm text-muted-foreground">
            Live stream of defect and comment events your role ({role}) is receiving via Supabase
            Realtime. RLS filters these per user — what you see here is exactly what your client
            is allowed to react to.
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