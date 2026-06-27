import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ReportsSubPageShell,
  useFilteredSubPageDefects,
  validateSubSearch,
  type SubPageSearch,
} from "@/components/qa/ReportsSubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const PIE_COLORS = [
  "oklch(0.6 0.2 250)",
  "oklch(0.62 0.17 150)",
  "oklch(0.7 0.2 50)",
  "oklch(0.6 0.22 27)",
  "oklch(0.55 0.18 300)",
];

export const Route = createFileRoute("/_app/_admin/reports/analytics")({
  validateSearch: validateSubSearch,
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const defects = useFilteredSubPageDefects(search);
  const patch = (p: Partial<SubPageSearch>) =>
    nav({ replace: true, search: (prev: SubPageSearch) => ({ ...prev, ...p }) });

  const byStatus = useMemo(() => {
    const map: Record<string, number> = {};
    defects.forEach((d) => {
      map[d.status] = (map[d.status] ?? 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [defects]);

  const bySeverity = useMemo(() => {
    const map: Record<string, number> = {};
    defects.forEach((d) => {
      map[d.severity] = (map[d.severity] ?? 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [defects]);

  return (
    <ReportsSubPageShell
      title="Analytics Report"
      description="Distribution of defects by status and severity in the chosen scope."
      search={search}
      onChange={patch}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {[
          { title: "By Status", data: byStatus },
          { title: "By Severity", data: bySeverity },
        ].map((chart) => (
          <Card key={chart.title}>
            <CardHeader>
              <CardTitle>{chart.title}</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chart.data}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={100}
                    label
                  >
                    {chart.data.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))}
      </div>
    </ReportsSubPageShell>
  );
}