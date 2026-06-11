import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useEnvironment } from "@/lib/qa/environment";
import { AlertCircle, RefreshCw } from "lucide-react";

type Task = {
  id: string; title: string; module: string; status: string;
  priority: string; due_date: string | null; environment: string; updated_at: string;
};
type Defect = {
  id: string; title: string; status: string; environment: string;
  module: string; created_at: string; updated_at: string; validity: string;
};

export function AgentDetailDrawer({
  open, onOpenChange, agent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  agent: { id: string | null; name: string; email: string } | null;
}) {
  const { env } = useEnvironment();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (!agent || !env) return;
    setLoading(true); setErr(null);
    try {
      const tq = supabase
        .from("retest_assignments")
        .select("id,title,module,status,priority,due_date,environment,updated_at")
        .eq("environment", env)
        .order("updated_at", { ascending: false });
      if (agent.id) tq.eq("assigned_agent_id", agent.id);
      else tq.eq("assigned_agent_name", agent.name);

      const dq = supabase
        .from("defects")
        .select("id,title,status,environment,module,created_at,updated_at,validity")
        .eq("environment", env)
        .eq("created_by", agent.name)
        .order("updated_at", { ascending: false });

      const [tr, dr] = await Promise.all([tq, dq]);
      if (tr.error) throw tr.error;
      if (dr.error) throw dr.error;
      setTasks((tr.data ?? []) as Task[]);
      setDefects((dr.data ?? []) as Defect[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !agent || !env) return;
    void load();
    const key = `agent-${agent.id ?? agent.email}-${env}`;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch = supabase.channel(key)
        .on("postgres_changes", {
          event: "*", schema: "public", table: "retest_assignments",
          filter: agent.id ? `assigned_agent_id=eq.${agent.id}` : undefined,
        }, () => void load())
        .on("postgres_changes", {
          event: "*", schema: "public", table: "defects",
          filter: `created_by=eq.${agent.name}`,
        }, () => void load())
        .subscribe();
    } catch { /* noop */ }
    return () => { if (ch) { try { void supabase.removeChannel(ch); } catch { /* noop */ } } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agent?.id, agent?.name, agent?.email, env]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{agent?.name ?? "Agent"}</SheetTitle>
          <SheetDescription>
            <span className="text-xs">{agent?.email}</span>
            {env && <Badge className="ml-2" variant="outline">{env}</Badge>}
          </SheetDescription>
        </SheetHeader>

        {err && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="inline-flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> Live updates temporarily unavailable.</p>
            <p className="mt-1 text-xs text-muted-foreground">{err}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => void load()}>
              <RefreshCw className="mr-1 h-3 w-3" /> Retry
            </Button>
          </div>
        )}

        <section className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Assigned Tasks ({tasks.length})
          </h3>
          {loading ? <Skeleton className="mt-2 h-24 w-full" /> : tasks.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No tasks in {env}.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {tasks.map((t) => (
                <li key={t.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{t.title || t.id}</p>
                    <Badge variant="secondary">{t.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.module || "—"} · {t.priority} {t.due_date ? `· due ${t.due_date}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Reported Errors ({defects.length})
          </h3>
          {loading ? <Skeleton className="mt-2 h-24 w-full" /> : defects.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No reported errors in {env}.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {defects.map((d) => (
                <li key={d.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{d.title || d.id}</p>
                    <Badge variant={d.status === "Fixed" ? "default" : "secondary"}>{d.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.module || "—"} · {d.validity} · {new Date(d.updated_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}