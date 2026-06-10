import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQA } from "@/lib/qa/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { Download } from "lucide-react";
import { exportXlsx } from "@/lib/qa/export";
import { ExportMenu } from "@/components/qa/ExportMenu";

export const Route = createFileRoute("/_app/reports")({
  component: ReportsPage,
});

const COLORS = ["oklch(0.55 0.18 255)", "oklch(0.62 0.17 150)", "oklch(0.75 0.16 75)", "oklch(0.6 0.22 27)", "oklch(0.65 0.15 300)"];

function ReportsPage() {
  const { forms, defects } = useQA();

  const passedVsFailed = useMemo(() => {
    const passed = forms.reduce((s, f) => s + f.passed, 0);
    const failed = forms.reduce((s, f) => s + f.failed, 0);
    return [
      { name: "Passed", value: passed },
      { name: "Failed", value: failed },
    ];
  }, [forms]);

  const defectsByModule = useMemo(() => {
    const map: Record<string, number> = {};
    defects.filter((d) => !["Fixed", "Closed"].includes(d.status)).forEach((d) => {
      map[d.module] = (map[d.module] ?? 0) + 1;
    });
    return Object.entries(map).map(([module, count]) => ({ module, count }));
  }, [defects]);

  const statusTrend = useMemo(() => {
    const days: { day: string; passed: number; failed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const label = d.toLocaleDateString("en-US", { weekday: "short" });
      const passed = Math.round(forms.reduce((s, f) => s + f.passed, 0) / 7 + (Math.random() * 20 - 10));
      const failed = Math.round(forms.reduce((s, f) => s + f.failed, 0) / 7 + (Math.random() * 4 - 2));
      days.push({ day: label, passed, failed });
    }
    return days;
  }, [forms]);

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
          <p className="text-sm text-muted-foreground">Power BI-style insights on testing performance.</p>
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
          <CardHeader><CardTitle>Passed vs Failed</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={passedVsFailed} dataKey="value" nameKey="name" outerRadius={90} label>
                  <Cell fill="oklch(0.62 0.17 150)" />
                  <Cell fill="oklch(0.6 0.22 27)" />
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Open Defects by Module</CardTitle></CardHeader>
          <CardContent className="h-72">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Test Status Trend (7 days)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={statusTrend}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="passed" stroke="oklch(0.62 0.17 150)" strokeWidth={2} />
                <Line type="monotone" dataKey="failed" stroke="oklch(0.6 0.22 27)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Agent-wise Defect Load</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentDefects} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" fontSize={12} />
                <YAxis type="category" dataKey="agent" fontSize={12} width={110} />
                <Tooltip />
                <Bar dataKey="count" fill="oklch(0.55 0.18 255)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Form-wise Testing Coverage</CardTitle></CardHeader>
          <CardContent className="h-80">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
