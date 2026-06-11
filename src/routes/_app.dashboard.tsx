import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { scopeForUser, filterByEnvironment } from "@/lib/qa/scope";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TestStatusBadge } from "@/components/qa/StatusBadge";
import { CheckCircle2, XCircle, Bug, ListChecks, ArrowRight, FileText, Globe, Wrench, RotateCw, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { forms, defects, currentUser } = useQA();
  const { env } = useEnvironment();
  const navigate = useNavigate();

  const scopedDefects = useMemo(
    () => {
      const byUser = scopeForUser(
        defects,
        currentUser ? { name: currentUser.name, role: currentUser.role } : null,
      );
      return filterByEnvironment(byUser, env);
    },
    [defects, env, currentUser],
  );

  const stats = useMemo(() => {
    const total = scopedDefects.length;
    const open = scopedDefects.filter((d) => !["Fixed", "Closed"].includes(d.status)).length;
    const valid = scopedDefects.filter((d) => d.validity === "Valid").length;
    const invalid = scopedDefects.filter((d) => d.validity === "Invalid").length;
    const fixed = scopedDefects.filter((d) => d.status === "Fixed").length;
    const retest = scopedDefects.filter((d) => d.status === "Retest Required").length;
    const closed = scopedDefects.filter((d) => d.status === "Closed").length;
    return { total, open, valid, invalid, fixed, retest, closed };
  }, [scopedDefects]);

  const kpis = [
    { label: "Total Tests", value: stats.total, Icon: ListChecks, tone: "primary", to: "/my-reported-errors" },
    { label: "Open Errors", value: stats.open, Icon: Bug, tone: "warning", to: "/my-reported-errors" },
    { label: "Valid Errors", value: stats.valid, Icon: CheckCircle2, tone: "success", to: "/my-reported-errors" },
    { label: "Invalid Errors", value: stats.invalid, Icon: XCircle, tone: "danger", to: "/my-reported-errors" },
    { label: "Fixed Errors", value: stats.fixed, Icon: Wrench, tone: "success", to: "/my-reported-errors" },
    { label: "Retest Errors", value: stats.retest, Icon: RotateCw, tone: "warning", to: "/my-reported-errors" },
    { label: "Closed Errors", value: stats.closed, Icon: CircleCheck, tone: "primary", to: "/my-reported-errors" },
  ] as const;

  const openCountByModule = (mod: string) =>
    scopedDefects.filter((d) => d.module === mod && !["Fixed", "Closed"].includes(d.status)).length;
  const modules = [
    {
      name: "Forms", to: "/forms", Icon: FileText,
      forms: forms.filter((f) => f.module === "1099 Forms").length,
      bugs: openCountByModule("1099 Forms"),
    },
    {
      name: "1099 Online Forms", to: "/online-1099", Icon: Globe,
      forms: forms.filter((f) => f.module === "1099 Online").length,
      bugs: openCountByModule("1099 Online"),
    },
  ];

  const featured = ["1099-NEC", "1099-MISC", "1099-HC", "1097-BTC", "990-T", "990-EZ"]
    .map((id) => forms.find((f) => f.id === id))
    .filter(Boolean) as typeof forms;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
          Real-time QA testing overview across all modules.
          {env && <Badge variant="outline">{env}</Badge>}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {kpis.map((k) => (
          <button
            key={k.label}
            onClick={() => navigate({ to: k.to })}
            className="group text-left"
          >
            <Card className="overflow-hidden border-border transition-all hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k.label}</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight">{k.value.toLocaleString()}</p>
                  </div>
                  <div
                    className={cn(
                      "grid h-11 w-11 place-items-center rounded-xl text-white",
                    )}
                    style={{
                      background:
                        k.tone === "success" ? "var(--gradient-success)" :
                        k.tone === "danger" ? "var(--gradient-danger)" :
                        k.tone === "warning" ? "var(--gradient-warning)" :
                        "var(--gradient-primary)",
                    }}
                  >
                    <k.Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 flex items-center text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  View details <ArrowRight className="ml-1 h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <section>
        <h3 className="mb-4 text-lg font-semibold">Modules</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m) => (
            <Link key={m.name} to={m.to}>
              <Card className="h-full border-border transition-all hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div
                      className="grid h-10 w-10 place-items-center rounded-lg text-primary-foreground"
                      style={{ background: "var(--gradient-primary)" }}
                    >
                      <m.Icon className="h-5 w-5" />
                    </div>
                    <h4 className="font-semibold">{m.name}</h4>
                  </div>
                  <div className="mt-4 space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Forms</span><span className="font-medium">{m.forms}</span></div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Open Errors</span>
                      <span className={cn("font-medium", m.bugs > 0 ? "text-destructive" : "text-success")}>{m.bugs}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-xs font-medium text-primary">
                    View Details <ArrowRight className="ml-1 h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-lg font-semibold">Form Testing Status</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {featured.map((f) => (
            <Link
              key={f.id}
              to="/forms"
              search={{ q: f.name } as never}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              <Card className="cursor-pointer border-border transition-all hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold truncate">{f.name}</p>
                  <div className="mt-3"><TestStatusBadge status={f.status} /></div>
                  {f.openDefects > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">{f.openDefects} open defect(s)</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
