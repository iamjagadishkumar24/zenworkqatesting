import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQA } from "@/lib/qa/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { Download, Inbox } from "lucide-react";
import { exportXlsx } from "@/lib/qa/export";
import { ExportMenu } from "@/components/qa/ExportMenu";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

const COLORS = ["oklch(0.55 0.18 255)", "oklch(0.62 0.17 150)", "oklch(0.75 0.16 75)", "oklch(0.6 0.22 27)", "oklch(0.65 0.15 300)"];

function EmptyBreakdown({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
      <Inbox className="h-8 w-8 opacity-40" />
      <p>{message}</p>
      <p className="text-xs">Report your first error from any module (e.g. Integrations or Excel Import Testing) to populate this breakdown.</p>
    </div>
  );
}

function ReportsPage() {
  const { forms, defects } = useQA();

  const passedVsFailed = useMemo(() => {
    const passed = forms.reduce((s, f) => s + f.passed, 0);
    const failed = forms.reduce((s, f) => s + f.failed, 0);
    return [
      { name: "Valid", value: passed },
      { name: "Invalid Errors", value: failed },
    ];
  }, [forms]);

  const defectsByModule = useMemo(() => {
    const map: Record<string, number> = {};
    defects.filter((d) => !["Fixed", "Closed"].includes(d.status)).forEach((d) => {
      map[d.module] = (map[d.module] ?? 0) + 1;
    });
    return Object.entries(map).map(([module, count]) => ({ module, count }));
  }, [defects]);

  const statusByModule = useMemo(() => {
    const map: Record<string, { module: string; open: number; fixed: number; retest: number; total: number }> = {};
    defects.forEach((d) => {
      const m = (map[d.module] ??= { module: d.module, open: 0, fixed: 0, retest: 0, total: 0 });
      m.total += 1;
      if (d.status === "Fixed" || d.status === "Closed") m.fixed += 1;
      else if (d.status === "Retest") m.retest += 1;
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
      const next = new Date(d); next.setDate(next.getDate() + 1);
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
    defects.forEach((d) => { map[d.assignedAgent] = (map[d.assignedAgent] ?? 0) + 1; });
    return Object.entries(map).map(([agent, count]) => ({ agent, count }));
  }, [defects]);

  const formCoverage = useMemo(
    () => forms.slice(0, 10).map((f) => ({ form: f.name.replace("Form ", ""), passed: f.passed, failed: f.failed })),
    [forms],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
          <p className="text-sm text-muted-foreground">Power BI-style insights on testing performance. Counts refresh in real time as defects are added, edited, or deleted.</p>
        </div>
        <div className="flex gap-2">
          <ExportMenu
            label="Forms"
            filename="forms"
            title="Forms export"
            rows={forms as unknown as Record<string, unknown>[]}
            columns={["id","name","module","status","passed","failed","openDefects","lastTested","assignedAgent"]}
          />
          <ExportMenu
            label="Defects"
            filename="defects"
            title="Defects export"
            rows={defects.map(({ comments, ...d }) => ({ ...d, commentsCount: comments.length }))}
            columns={["id","module","formFeature","title","status","priority","severity","assignedAgent","createdBy","createdAt","updatedAt","updatedBy","commentsCount"]}
          />
          <Button
            variant="outline"
            onClick={() =>
              exportXlsx(
                "qa-report",
                [
                  { name: "Passed vs Failed", rows: passedVsFailed },
                  { name: "Defects by Module", rows: defectsByModule },
                  { name: "Status by Module", rows: statusByModule },
                  { name: "Status Trend", rows: statusTrend },
                  { name: "Agent Load", rows: agentDefects },
                  { name: "Form Coverage", rows: formCoverage },
                ],
                { title: "QA Analytics Report" },
              )
            }
          ><Download className="mr-2 h-4 w-4" />Full Report (xlsx)</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Valid vs Invalid Errors</CardTitle>
            <ExportMenu label="Export" filename="valid-vs-invalid" title="Valid vs Invalid Errors"
              rows={passedVsFailed as unknown as Record<string, unknown>[]} columns={["name","value"]} />
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
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Open Errors by Module</CardTitle>
            <ExportMenu label="Export" filename="open-by-module" title="Open Errors by Module"
              rows={defectsByModule as unknown as Record<string, unknown>[]} columns={["module","count"]} />
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
                  {defectsByModule.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Open / Fixed / Retest by Module</CardTitle>
            <ExportMenu label="Export" filename="status-by-module" title="Status by Module"
              rows={statusByModule as unknown as Record<string, unknown>[]} columns={["module","open","fixed","retest","total"]} />
          </CardHeader>
          <CardContent className="h-72">
            {statusByModule.length === 0 ? (
              <EmptyBreakdown message="No defects logged in any module yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusByModule}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="module" fontSize={11} />
                  <YAxis fontSize={12} />
                  <Tooltip /><Legend />
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
            <ExportMenu label="Export" filename="status-trend-7d" title="Reported vs Closed (7 days)"
              rows={statusTrend as unknown as Record<string, unknown>[]} columns={["day","reported","closed"]} />
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
                <Line type="monotone" dataKey="reported" stroke="oklch(0.6 0.22 27)" strokeWidth={2} />
                <Line type="monotone" dataKey="closed" stroke="oklch(0.62 0.17 150)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Agent-wise Error Load</CardTitle>
            <ExportMenu label="Export" filename="agent-load" title="Agent-wise Error Load"
              rows={agentDefects as unknown as Record<string, unknown>[]} columns={["agent","count"]} />
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
            <ExportMenu label="Export" filename="form-coverage" title="Form-wise Coverage"
              rows={formCoverage as unknown as Record<string, unknown>[]} columns={["form","passed","failed"]} />
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
