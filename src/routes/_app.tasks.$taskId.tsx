import { createFileRoute, Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQA } from "@/lib/qa/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import { routeForModule } from "@/lib/qa/constants";

/**
 * Deep-link resolver. Email links land here as /tasks/<assignment-id>.
 * - Auth is already enforced by /_app — unauthenticated users go to /login.
 * - We validate the current user is the assigned agent (or an admin),
 *   then redirect to the right module page with the assignment + form
 *   pre-selected. If the task no longer exists or is out of scope, we show
 *   a clean "no longer available" message instead of leaking details.
 */
export const Route = createFileRoute("/_app/tasks/$taskId")({
  component: TaskRedirect,
});

function TaskRedirect() {
  const { taskId } = useParams({ from: "/_app/tasks/$taskId" });
  const { currentUser } = useQA();
  const navigate = useNavigate();
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "denied" }
    | { status: "redirect"; to: string; search: Record<string, string> }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentUser) return;
      const [a, f] = await Promise.all([
        supabase.from("retest_assignments").select("*").eq("id", taskId).maybeSingle(),
        supabase.from("retest_assignment_forms").select("*").eq("assignment_id", taskId),
      ]);
      if (cancelled) return;
      if (a.error || !a.data) {
        setState({ status: "denied" });
        return;
      }
      const row = a.data as { assigned_agent_id: string | null; module: string };
      const isMine = row.assigned_agent_id === currentUser.id;
      const isAdmin = currentUser.role === "admin";
      if (!isMine && !isAdmin) {
        setState({ status: "denied" });
        return;
      }
      const firstForm = (f.data?.[0] as { form_name?: string } | undefined)?.form_name;
      const to = routeForModule(row.module);
      const search: Record<string, string> = { assignment: taskId };
      if (firstForm) search.q = firstForm;
      setState({ status: "redirect", to, search });
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, currentUser]);

  if (state.status === "redirect") {
    return <Navigate to={state.to} search={state.search as never} replace />;
  }

  if (state.status === "denied") {
    return (
      <div className="mx-auto max-w-md py-16">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">This assigned task is no longer available.</p>
            <p className="text-xs text-muted-foreground">
              It may have been removed or reassigned to another agent.
            </p>
            <Button size="sm" variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Opening assigned task…
    </div>
  );
}
