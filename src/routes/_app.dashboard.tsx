import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { useTaxYear, matchesTaxYear } from "@/lib/qa/taxYear";
import { scopeForUser, filterByEnvironment } from "@/lib/qa/scope";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TestStatusBadge } from "@/components/qa/StatusBadge";
import { CheckCircle2, XCircle, Bug, ListChecks, ArrowRight, FileText, Globe, Wrench, RotateCw, FileSpreadsheet, Plug, MessageSquare, Cpu, Sparkles, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { forms, defects, currentUser } = useQA();
  const { env } = useEnvironment();
  const { taxYear } = useTaxYear();
  const navigate = useNavigate();

  const scopedDefects = useMemo(
    () => {
      const byUser = scopeForUser(
        defects,
        currentUser ? { name: currentUser.name, role: currentUser.role } : null,
      );
      const byEnv = filterByEnvironment(byUser, env);
      return byEnv.filter((d) => matchesTaxYear(d.taxYear, taxYear));
    },
    [defects, env, currentUser, taxYear],
  );

  const stats = useMemo(() => {
    const total = scopedDefects.length;
    const open = scopedDefects.filter((d) => !["Fixed", "Closed"].includes(d.status)).length;
    const valid = scopedDefects.filter((d) => d.validity === "Valid").length;
    const invalid = scopedDefects.filter((d) => d.validity === "Invalid").length;
    const fixed = scopedDefects.filter((d) => d.status === "Fixed" || d.status === "Closed").length;
    const retest = scopedDefects.filter((d) => d.status === "Retest Required").length;
    return { total, open, valid, invalid, fixed, retest };
  }, [scopedDefects]);

  const kpis = [
    { label: "Total Tests", value: stats.total, Icon: ListChecks, tone: "primary", to: "/my-reported-errors" },
    { label: "Open Errors", value: stats.open, Icon: Bug, tone: "warning", to: "/my-reported-errors" },
    { label: "Valid Errors", value: stats.valid, Icon: CheckCircle2, tone: "success", to: "/my-reported-errors" },
    { label: "Invalid Errors", value: stats.invalid, Icon: XCircle, tone: "danger", to: "/my-reported-errors" },
    { label: "Fixed Errors", value: stats.fixed, Icon: Wrench, tone: "success", to: "/my-reported-errors" },
    { label: "Retest Errors", value: stats.retest, Icon: RotateCw, tone: "warning", to: "/my-reported-errors" },
  ] as const;

  const countByModule = (mod: string) =>
    scopedDefects.filter((d) => d.module === mod).length;
  const modules = [
    { name: "Forms", to: "/forms", Icon: FileText, key: "1099 Forms" },
    { name: "1099 Online Forms", to: "/online-1099", Icon: Globe, key: "1099 Online" },
    { name: "990 Form Testing", to: "/990-forms", Icon: FileText, key: "990 Forms" },
    { name: "2290 Forms", to: "/2290-forms", Icon: FileSpreadsheet, key: "2290 Forms" },
    { name: "Integrations", to: "/integrations", Icon: Plug, key: "Integrations" },
    { name: "Chatbot Testing", to: "/chatbot-testing", Icon: MessageSquare, key: "Chatbot Testing" },
    { name: "Excel Import Testing", to: "/excel-import-testing", Icon: FileUp, key: "Excel Import Testing" },
    { name: "Functionality Testing", to: "/functionality-testing", Icon: Cpu, key: "Functionality Testing" },
    { name: "Tax1099 Features", to: "/tax1099-features", Icon: Sparkles, key: "Tax1099 Features" },
  ].map((m) => ({ ...m, bugs: countByModule(m.key) }));

  // Only show forms that actually have reported errors in scope
  const reportedFormNames = useMemo(() => {
    const set = new Set<string>();
    for (const d of scopedDefects) {
      const name = (d.formFeature || "").trim();
      if (name) set.add(name);
    }
    return Array.from(set);
  }, [scopedDefects]);
  const reportedForms = reportedFormNames.map((name) => {
    const f = forms.find((x) => x.name === name || x.id === name);
    const openDefects = scopedDefects.filter((d) => (d.formFeature || "") === name && !["Fixed", "Closed"].includes(d.status)).length;
    return { id: f?.id ?? name, name, status: f?.status ?? "Open Bug" as const, openDefects };
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2">
          Real-time QA testing overview across all modules.
          {env && <Badge variant="outline">{env}</Badge>}
          <Badge variant="outline">Tax Year: {taxYear === "all" ? "All" : taxYear}</Badge>
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
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reported Errors</span>
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
        {reportedForms.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No forms have reported errors yet.
            </CardContent>
          </Card>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {reportedForms.map((f) => (
            <Link
              key={f.id}
              to="/my-reported-errors"
              search={{ q: f.name } as never}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              <Card className="cursor-pointer border-border transition-all hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold truncate">{f.name}</p>
                  <div className="mt-3"><TestStatusBadge status={f.status} /></div>
                  {f.openDefects > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">{f.openDefects} open error(s)</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        )}
      </section>
    </div>
  );
}
