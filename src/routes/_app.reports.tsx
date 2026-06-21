import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { useTaxYear, matchesTaxYear } from "@/lib/qa/taxYear";
import { TAX_YEARS } from "@/lib/qa/constants";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSavedViews, type ReportFilters } from "@/lib/qa/reportsViews";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Download, Inbox, FileText, Save, Trash2, Loader2 } from "lucide-react";
import { exportPdf, exportXlsx } from "@/lib/qa/export";
import { ExportMenu } from "@/components/qa/ExportMenu";

type ReportSearch = ReportFilters;
const DEFAULT_SEARCH: ReportSearch = {
  status: "all",
  testingType: "all",
  category: "all",
  agent: "all",
  dateRange: "all",
  fromDate: "",
  toDate: "",
};

function validateReportSearch(input: Record<string, unknown>): ReportSearch {
  const s = (k: keyof ReportSearch) =>
    typeof input[k] === "string" ? (input[k] as string) : DEFAULT_SEARCH[k];
  return {
    status: s("status"),
    testingType: s("testingType"),
    category: s("category"),
    agent: s("agent"),
    dateRange: s("dateRange"),
    fromDate: s("fromDate"),
    toDate: s("toDate"),
  };
}

export const Route = createFileRoute("/_app/reports")({
  validateSearch: validateReportSearch,
  component: ReportsPage,
});

const COLORS = [
  "oklch(0.55 0.18 255)",
  "oklch(0.62 0.17 150)",
  "oklch(0.75 0.16 75)",
  "oklch(0.6 0.22 27)",
  "oklch(0.65 0.15 300)",
];

function EmptyBreakdown({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
      <Inbox className="h-8 w-8 opacity-40" />
      <p>{message}</p>
      <p className="text-xs">
        Report your first error from any module (e.g. Integrations or Excel Import Testing) to
        populate this breakdown.
      </p>
    </div>
  );
}

function ReportsPage() {
  const { defects: allDefects, loading } = useQA();
  const { env } = useEnvironment();
  const { taxYear, setTaxYear } = useTaxYear();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { status, testingType, category, agent, dateRange, fromDate, toDate } = search;

  const patchSearch = (patch: Partial<ReportSearch>) =>
    navigate({
      replace: true,
      search: (prev) => ({ ...prev, ...patch }),
    });
  const setStatus = (v: string) => patchSearch({ status: v });
  const setTestingType = (v: string) => patchSearch({ testingType: v });
  const setCategory = (v: string) => patchSearch({ category: v });
  const setAgent = (v: string) => patchSearch({ agent: v });
  const setDateRange = (v: string) =>
    patchSearch({ dateRange: v, ...(v === "custom" ? {} : { fromDate: "", toDate: "" }) });

  // Debounced custom date inputs: keep typing local, push to URL after 400ms.
  const [fromInput, setFromInput] = useState(fromDate);
  const [toInput, setToInput] = useState(toDate);
  useEffect(() => setFromInput(fromDate), [fromDate]);
  useEffect(() => setToInput(toDate), [toDate]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (fromInput !== fromDate || toInput !== toDate)
        patchSearch({ fromDate: fromInput, toDate: toInput });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromInput, toInput]);

  const { views, save: saveView, remove: removeView } = useSavedViews();
  const [viewName, setViewName] = useState("");
  const [drill, setDrill] = useState<{ title: string; rows: typeof allDefects } | null>(null);

  const resetFilters = () =>
    navigate({ replace: true, search: () => ({ ...DEFAULT_SEARCH }) });

  const applyView = (name: string) => {
    const v = views.find((x) => x.name === name);
    if (v) navigate({ replace: true, search: () => ({ ...v.filters }) });
  };

  const scoped = useMemo(
    () =>
      allDefects.filter(
        (d) =>
          (!env || (d.environment ?? "Production") === env) && matchesTaxYear(d.taxYear, taxYear),
      ),
    [allDefects, env, taxYear],
  );

  const categories = useMemo(
    () => Array.from(new Set(scoped.map((d) => d.module))).sort(),
    [scoped],
  );
  const agents = useMemo(
    () =>
      Array.from(
        new Set(scoped.flatMap((d) => [d.assignedAgent, d.createdBy].filter(Boolean))),
      ).sort() as string[],
    [scoped],
  );

  const matchesStatus = (d: (typeof scoped)[number]) => {
    if (status === "all") return true;
    if (status === "Open") return !["Fixed", "Closed"].includes(d.status);
    if (status === "Fixed") return ["Fixed", "Closed"].includes(d.status);
    if (status === "Retest Required") return d.status === "Retest Required";
    if (status === "Valid") return d.validity === "Valid";
    if (status === "Invalid") return d.validity === "Invalid";
    if (status === "Pending Review") return !d.validity || d.validity === "Unverified";
    return true;
  };

  const dateBounds = useMemo((): [Date | null, Date | null] => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (dateRange === "today") return [start, null];
    if (dateRange === "yesterday") {
      const s = new Date(start);
      s.setDate(s.getDate() - 1);
      return [s, start];
    }
    if (dateRange === "7d") {
      const s = new Date(start);
      s.setDate(s.getDate() - 6);
      return [s, null];
    }
    if (dateRange === "30d") {
      const s = new Date(start);
      s.setDate(s.getDate() - 29);
      return [s, null];
    }
    if (dateRange === "custom") {
      return [fromDate ? new Date(fromDate) : null, toDate ? new Date(toDate + "T23:59:59") : null];
    }
    return [null, null];
  }, [dateRange, fromDate, toDate]);

  const defects = useMemo(() => {
    const [from, to] = dateBounds;
    return scoped.filter((d) => {
      if (!matchesStatus(d)) return false;
      if (testingType !== "all" && !d.module.toLowerCase().includes(testingType.toLowerCase()))
        return false;
      if (category !== "all" && d.module !== category) return false;
      if (agent !== "all" && d.assignedAgent !== agent && d.createdBy !== agent) return false;
      const created = new Date(d.createdAt);
      if (from && created < from) return false;
      if (to && created >= to) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, status, testingType, category, agent, dateBounds]);

  // Data-integrity validation: warn when the active filtered set diverges
  // from the scoped total in ways callers wouldn't expect.
  useEffect(() => {
    if (status === "all" && testingType === "all" && category === "all" && agent === "all" && dateRange === "all") {
      if (defects.length !== scoped.length) {
        console.warn(
          "[Reports integrity] filtered count mismatch with scoped store",
          { reports: defects.length, store: scoped.length },
        );
      }
    }
  }, [defects.length, scoped.length, status, testingType, category, agent, dateRange]);

  const summary = useMemo(
    () => ({
      total: defects.length,
      open: defects.filter((d) => !["Fixed", "Closed"].includes(d.status)).length,
      fixed: defects.filter((d) => ["Fixed", "Closed"].includes(d.status)).length,
      retest: defects.filter((d) => d.status === "Retest Required").length,
      valid: defects.filter((d) => d.validity === "Valid").length,
      invalid: defects.filter((d) => d.validity === "Invalid").length,
      pending: defects.filter((d) => !d.validity || d.validity === "Unverified").length,
    }),
    [defects],
  );

  const passedVsFailed = useMemo(() => {
    const valid = defects.filter((d) => d.validity === "Valid").length;
    const invalid = defects.filter((d) => d.validity === "Invalid").length;
    return [
      { name: "Valid", value: valid },
      { name: "Invalid Errors", value: invalid },
    ];
  }, [defects]);

  const defectsByModule = useMemo(() => {
    const map: Record<string, number> = {};
    defects
      .filter((d) => !["Fixed", "Closed"].includes(d.status))
      .forEach((d) => {
        map[d.module] = (map[d.module] ?? 0) + 1;
      });
    return Object.entries(map).map(([module, count]) => ({ module, count }));
  }, [defects]);

  const statusByModule = useMemo(() => {
    const map: Record<
      string,
      { module: string; open: number; fixed: number; retest: number; total: number }
    > = {};
    defects.forEach((d) => {
      const m = (map[d.module] ??= { module: d.module, open: 0, fixed: 0, retest: 0, total: 0 });
      m.total += 1;
      if (d.status === "Fixed" || d.status === "Closed") m.fixed += 1;
      else if (d.status === "Retest Required" || d.status === "Reopened") m.retest += 1;
      else m.open += 1;
    });
    return Object.values(map);
  }, [defects]);

  const statusTrend = useMemo(() => {
    // Real, deterministic trend: how many real errors were reported / closed
    // per day for the last 7 days. No fake/random values.
    const days: { day: string; reported: number; closed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const label = d.toLocaleDateString("en-US", { weekday: "short" });
      const reported = defects.filter((x) => {
        const t = new Date(x.createdAt);
        return t >= d && t < next;
      }).length;
      const closed = defects.filter((x) => {
        const t = new Date(x.updatedAt);
        return t >= d && t < next && ["Fixed", "Closed"].includes(x.status);
      }).length;
      days.push({ day: label, reported, closed });
    }
    return days;
  }, [defects]);

  const agentDefects = useMemo(() => {
    const map: Record<string, number> = {};
    defects.forEach((d) => {
      map[d.assignedAgent] = (map[d.assignedAgent] ?? 0) + 1;
    });
    return Object.entries(map).map(([agent, count]) => ({ agent, count }));
  }, [defects]);

  const formCoverage = useMemo(() => {
    const map: Record<string, { form: string; passed: number; failed: number }> = {};
    defects.forEach((d) => {
      const key = d.formFeature || d.module;
      const e = (map[key] ??= { form: key, passed: 0, failed: 0 });
      if (d.validity === "Valid") e.passed += 1;
      else if (d.validity === "Invalid") e.failed += 1;
    });
    return Object.values(map)
      .sort((a, b) => b.passed + b.failed - (a.passed + a.failed))
      .slice(0, 10);
  }, [defects]);

  const activeFilters = {
    environment: env ?? "All",
    taxYear: taxYear === "all" ? "All" : taxYear,
    status,
    testingType,
    category,
    agent,
    dateRange,
    from: fromDate || "—",
    to: toDate || "—",
  };

  const summaryRows = [
    { metric: "Total Reported", count: summary.total },
    { metric: "Open", count: summary.open },
    { metric: "Fixed/Closed", count: summary.fixed },
    { metric: "Retest Required", count: summary.retest },
    { metric: "Valid", count: summary.valid },
    { metric: "Invalid", count: summary.invalid },
    { metric: "Pending Review", count: summary.pending },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
          <p className="text-sm text-muted-foreground inline-flex flex-wrap items-center gap-2">
            Power BI-style insights on testing performance. Counts refresh in real time as errors
            are added, edited, or deleted.
            {env && <Badge variant="outline">{env}</Badge>}
            <Badge variant="outline">Tax Year: {taxYear === "all" ? "All" : taxYear}</Badge>
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={taxYear} onValueChange={(v) => setTaxYear(v as typeof taxYear)}>
            <SelectTrigger className="h-9 w-[140px]" aria-label="Tax Year filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tax Years</SelectItem>
              {TAX_YEARS.map((y) => (
                <SelectItem key={y} value={y}>
                  Tax Year {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportMenu
            label="Errors"
            filename="errors"
            title="Errors export"
            rows={defects.map(({ comments, ...d }) => ({ ...d, commentsCount: comments.length }))}
            columns={[
              "id",
              "module",
              "formFeature",
              "taxYear",
              "environment",
              "title",
              "status",
              "validity",
              "priority",
              "severity",
              "assignedAgent",
              "createdBy",
              "createdAt",
              "updatedAt",
              "updatedBy",
              "commentsCount",
            ]}
            filters={activeFilters}
          />
          <Button
            variant="outline"
            onClick={() =>
              exportXlsx(
                "qa-report",
                [
                  { name: "Summary", rows: summaryRows },
                  { name: "Passed vs Failed", rows: passedVsFailed },
                  { name: "Errors by Module", rows: defectsByModule },
                  { name: "Status by Module", rows: statusByModule },
                  { name: "Status Trend", rows: statusTrend },
                  { name: "Agent Load", rows: agentDefects },
                  { name: "Form Coverage", rows: formCoverage },
                ],
                { title: "QA Analytics Report", filters: activeFilters },
              )
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Full (xlsx)
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              exportPdf(
                "qa-report",
                "QA Analytics Report",
                [
                  { name: "Summary", rows: summaryRows },
                  { name: "Errors by Module", rows: defectsByModule },
                  { name: "Status by Module", rows: statusByModule },
                  { name: "Agent Load", rows: agentDefects },
                ],
                { filters: activeFilters },
              )
            }
          >
            <FileText className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["all", "Open", "Fixed", "Retest Required", "Valid", "Invalid", "Pending Review"].map((s) => (
                  <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Testing Type</Label>
            <Select value={testingType} onValueChange={setTestingType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["all", "Functionality", "Integration", "Regression", "UI", "API"].map((s) => (
                  <SelectItem key={s} value={s}>{s === "all" ? "All types" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Agent</Label>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((a) => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date</Label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dateRange === "custom" && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label>From</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9" />
              </div>
              <div className="flex-1">
                <Label>To</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9" />
              </div>
            </div>
          )}
          <div className="md:col-span-3 lg:col-span-6 flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <span>
              Showing <strong className="text-foreground">{defects.length}</strong> of {scoped.length} errors in scope
              {scoped.length !== allDefects.length && (
                <> (store total {allDefects.length})</>
              )}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setStatus("all"); setTestingType("all"); setCategory("all");
                setAgent("all"); setDateRange("all"); setFromDate(""); setToDate("");
              }}
            >
              Reset filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {summaryRows.map((s) => (
          <Card key={s.metric}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.metric}</p>
              <p className="text-2xl font-bold tabular-nums">{s.count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Valid vs Invalid Errors</CardTitle>
            <ExportMenu
              label="Export"
              filename="valid-vs-invalid"
              title="Valid vs Invalid Errors"
              rows={passedVsFailed as unknown as Record<string, unknown>[]}
              columns={["name", "value"]}
            />
          </CardHeader>
          <CardContent className="h-72">
            {passedVsFailed.every((p) => p.value === 0) ? (
              <EmptyBreakdown message="No Valid or Invalid Errors recorded yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={passedVsFailed} dataKey="value" nameKey="name" outerRadius={90} label>
                    <Cell fill="oklch(0.62 0.17 150)" />
                    <Cell fill="oklch(0.6 0.22 27)" />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Open Errors by Module</CardTitle>
            <ExportMenu
              label="Export"
              filename="open-by-module"
              title="Open Errors by Module"
              rows={defectsByModule as unknown as Record<string, unknown>[]}
              columns={["module", "count"]}
            />
          </CardHeader>
          <CardContent className="h-72">
            {defectsByModule.length === 0 ? (
              <EmptyBreakdown message="No open errors across modules." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={defectsByModule}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="module" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {defectsByModule.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Open / Fixed / Retest by Module</CardTitle>
            <ExportMenu
              label="Export"
              filename="status-by-module"
              title="Status by Module"
              rows={statusByModule as unknown as Record<string, unknown>[]}
              columns={["module", "open", "fixed", "retest", "total"]}
            />
          </CardHeader>
          <CardContent className="h-72">
            {statusByModule.length === 0 ? (
              <EmptyBreakdown message="No errors logged in any module yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusByModule}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="module" fontSize={11} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="open" stackId="s" fill="oklch(0.6 0.22 27)" />
                  <Bar dataKey="retest" stackId="s" fill="oklch(0.75 0.16 75)" />
                  <Bar dataKey="fixed" stackId="s" fill="oklch(0.62 0.17 150)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Reported vs Closed Errors (7 days)</CardTitle>
            <ExportMenu
              label="Export"
              filename="status-trend-7d"
              title="Reported vs Closed (7 days)"
              rows={statusTrend as unknown as Record<string, unknown>[]}
              columns={["day", "reported", "closed"]}
            />
          </CardHeader>
          <CardContent className="h-72">
            {statusTrend.every((d) => d.reported === 0 && d.closed === 0) ? (
              <EmptyBreakdown message="No errors reported or closed in the last 7 days." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={statusTrend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="reported"
                    stroke="oklch(0.6 0.22 27)"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="closed"
                    stroke="oklch(0.62 0.17 150)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Agent-wise Error Load</CardTitle>
            <ExportMenu
              label="Export"
              filename="agent-load"
              title="Agent-wise Error Load"
              rows={agentDefects as unknown as Record<string, unknown>[]}
              columns={["agent", "count"]}
            />
          </CardHeader>
          <CardContent className="h-72">
            {agentDefects.length === 0 ? (
              <EmptyBreakdown message="No errors assigned to any agent yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agentDefects} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" fontSize={12} />
                  <YAxis type="category" dataKey="agent" fontSize={12} width={110} />
                  <Tooltip />
                  <Bar dataKey="count" fill="oklch(0.55 0.18 255)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Form-wise Testing Coverage (Valid vs Invalid Errors)</CardTitle>
            <ExportMenu
              label="Export"
              filename="form-coverage"
              title="Form-wise Coverage"
              rows={formCoverage as unknown as Record<string, unknown>[]}
              columns={["form", "passed", "failed"]}
            />
          </CardHeader>
          <CardContent className="h-80">
            {formCoverage.length === 0 ? (
              <EmptyBreakdown message="No form testing activity recorded yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={formCoverage}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="form" fontSize={11} angle={-20} textAnchor="end" height={70} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="passed" stackId="a" fill="oklch(0.62 0.17 150)" />
                  <Bar dataKey="failed" stackId="a" fill="oklch(0.6 0.22 27)" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
