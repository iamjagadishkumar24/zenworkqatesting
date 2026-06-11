import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TestStatusBadge } from "@/components/qa/StatusBadge";
import { CheckCircle2, XCircle, Bug, ListChecks, ArrowRight, FileText, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { forms, defects } = useQA();
  const { env } = useEnvironment();
  const navigate = useNavigate();

  const scopedDefects = useMemo(
    () => defects.filter((d) => !env || !d.environment || d.environment === env),
    [defects, env],
  );

  const stats = useMemo(() => {
    const passed = forms.reduce((s, f) => s + f.passed, 0);
    const failed = forms.reduce((s, f) => s + f.failed, 0);
    const open = scopedDefects.filter((d) => !["Fixed", "Closed"].includes(d.status)).length;
    return { total: passed + failed, passed, failed, open };
  }, [forms, scopedDefects]);

  const kpis = [
    { label: "Total Tests", value: stats.total, Icon: ListChecks, tone: "primary", to: "/defects" },
    { label: "Passed", value: stats.passed, Icon: CheckCircle2, tone: "success", to: "/forms" },
    { label: "Failed", value: stats.failed, Icon: XCircle, tone: "danger", to: "/defects", filter: "failed" },
    { label: "Open Defects", value: stats.open, Icon: Bug, tone: "warning", to: "/defects", filter: "open" },
  ] as const;

  const modules = [
    {
      name: "Forms", to: "/forms", Icon: FileText,
      forms: forms.filter((f) => f.module === "1099 Forms").length,
      bugs: forms.filter((f) => f.module === "1099 Forms").reduce((s, f) => s + f.openDefects, 0),
    },
    {
      name: "1099 Online Forms", to: "/online-1099", Icon: Globe,
      forms: forms.filter((f) => f.module === "1099 Online").length,
      bugs: forms.filter((f) => f.module === "1099 Online").reduce((s, f) => s + f.openDefects, 0),
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                      <span className="text-muted-foreground">Open Bugs</span>
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
