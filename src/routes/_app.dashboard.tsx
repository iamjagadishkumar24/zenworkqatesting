import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { useTaxYear, matchesTaxYear } from "@/lib/qa/taxYear";
import { scopeForUser, filterByEnvironment } from "@/lib/qa/scope";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TestStatusBadge } from "@/components/qa/StatusBadge";
import { CheckCircle2, XCircle, Bug, ListChecks, ArrowRight, FileText, Globe, Wrench, RotateCw, FileSpreadsheet, Plug, MessageSquare, Cpu, Sparkles, FileUp, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRetests } from "@/lib/qa/retest";
import { routeForModule } from "@/lib/qa/constants";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { forms, defects, currentUser } = useQA();
  const { env } = useEnvironment();
  const { taxYear } = useTaxYear();
  const { items: retestItems } = useRetests();

  // Tasks assigned to current user (or all, for admins) scoped by env + tax year
  const myTasks = useMemo(() => {
    return retestItems.filter((r) => {
      if (env && r.environment !== env) return false;
      if (!matchesTaxYear(r.tax_year ?? null, taxYear)) return false;
      if (currentUser?.role === "agent") return r.assigned_agent_id === currentUser.id;
      return true;
    });
  }, [retestItems, env, taxYear, currentUser]);

  // Names of forms currently assigned to the logged-in user — used to badge
  // them on the Form Testing Status grid.
  const assignedFormNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of myTasks) {
      if (r.status === "Completed") continue;
      for (const f of r.forms) set.add(f.form_name);
    }
    return set;
  }, [myTasks]);

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
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
          Real-time QA testing overview across all modules.
          {env && <Badge variant="outline">{env}</Badge>}
          <Badge variant="outline">Tax Year: {taxYear === "all" ? "All" : taxYear}</Badge>
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => {
          const enabled = k.value > 0;
          const inner = (
            <Card
              className={cn(
                "overflow-hidden border-border transition-all",
                enabled
                  ? "hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5"
                  : "opacity-60",
              )}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">{k.label}</p>
                    <p className="mt-1 text-xl font-bold tracking-tight">{k.value.toLocaleString()}</p>
                  </div>
                  <div
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
                    style={{
                      background:
                        k.tone === "success" ? "var(--gradient-success)" :
                        k.tone === "danger" ? "var(--gradient-danger)" :
                        k.tone === "warning" ? "var(--gradient-warning)" :
                        "var(--gradient-primary)",
                    }}
                  >
                    <k.Icon className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
          if (!enabled) {
            return (
              <div
                key={k.label}
                role="button"
                aria-disabled="true"
                tabIndex={-1}
                title="No records available."
                className="text-left cursor-not-allowed select-none"
              >
                {inner}
              </div>
            );
          }
          return (
            <Link
              key={k.label}
              to={k.to}
              className="group block text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              {inner}
            </Link>
          );
        })}
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Modules</h3>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
        >
          {modules.map((m) => (
            <Link key={m.name} to={m.to}>
              <Card className="h-full border-border transition-all hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-primary-foreground"
                      style={{ background: "var(--gradient-primary)" }}
                    >
                      <m.Icon className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-xs font-semibold leading-tight line-clamp-2">{m.name}</h4>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Errors</span>
                    <span className={cn("font-semibold", m.bugs > 0 ? "text-destructive" : "text-success")}>{m.bugs}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Form Testing Status</h3>
        {reportedForms.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-4 text-center text-xs text-muted-foreground">
              No forms have reported errors yet.
            </CardContent>
          </Card>
        ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
        >
          {reportedForms.map((f) => {
            const isAssigned = assignedFormNames.has(f.name);
            return (
            <Link
              key={f.id}
              to="/my-reported-errors"
              search={{ q: f.name } as never}
              className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
            >
              <Card className={cn(
                "cursor-pointer border-border transition-all hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5",
                isAssigned && "border-primary/50 ring-1 ring-primary/20",
              )}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-semibold truncate">{f.name}</p>
                    {isAssigned && <Badge variant="outline" className="shrink-0 text-[9px] border-primary/40 text-primary">Assigned</Badge>}
                  </div>
                  <div className="mt-2"><TestStatusBadge status={f.status} /></div>
                  {f.openDefects > 0 && (
                    <p className="mt-1 text-[10px] text-muted-foreground">{f.openDefects} open error(s)</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );})}
        </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold inline-flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            {currentUser?.role === "agent" ? "My Assigned Tasks" : "Assigned Tasks"}
          </h3>
          <Link to="/retest" className="text-xs font-medium text-primary inline-flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {myTasks.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-4 text-center text-xs text-muted-foreground">
              No tasks assigned yet.
            </CardContent>
          </Card>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
          >
            {myTasks.slice(0, 8).map((t) => {
              const firstForm = t.forms[0]?.form_name;
              const target = routeForModule(t.module);
              const search = firstForm ? ({ q: firstForm, assignment: t.id } as never) : ({ assignment: t.id } as never);
              const statusTone =
                t.status === "Completed" ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                : t.status === "In Progress" ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                : "border-primary/40 text-primary";
              const mine = t.assigned_agent_id === currentUser?.id;
              return (
                <Link
                  key={t.id}
                  to={target}
                  search={search}
                  className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                >
                  <Card className="h-full border-border transition-all hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight line-clamp-2">
                          {firstForm || t.title || t.module || "Task"}
                        </p>
                        <Badge variant="outline" className={cn("shrink-0 text-[10px]", statusTone)}>{t.status}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {t.module && <span>{t.module}</span>}
                        {t.tax_year && <span>· TY {t.tax_year}</span>}
                        {t.due_date && <span>· Due {t.due_date}</span>}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <Badge variant="secondary" className="text-[10px]">
                          {mine ? "Assigned to you" : `Assigned: ${t.assigned_agent_name}`}
                        </Badge>
                        {t.forms.length > 1 && (
                          <span className="text-[10px] text-muted-foreground">+{t.forms.length - 1} more</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
