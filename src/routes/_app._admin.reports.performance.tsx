import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  DEFAULT_SUB_SEARCH,
  ReportsSubPageShell,
  useFilteredSubPageDefects,
  validateSubSearch,
  type SubPageSearch,
} from "@/components/qa/ReportsSubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_app/_admin/reports/performance")({
  validateSearch: validateSubSearch,
  component: PerformancePage,
});

function PerformancePage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const defects = useFilteredSubPageDefects(search);

  const patch = (p: Partial<SubPageSearch>) =>
    nav({ replace: true, search: (prev: SubPageSearch) => ({ ...prev, ...p }) });

  /** Mean resolution latency in hours, bucketed by priority. */
  const byPriority = useMemo(() => {
    const groups: Record<string, { total: number; count: number }> = {};
    defects.forEach((d) => {
      const created = new Date(d.createdAt).getTime();
      const updated = new Date(d.updatedAt).getTime();
      if (!Number.isFinite(created) || !Number.isFinite(updated) || updated < created) return;
      const g = (groups[d.priority] ??= { total: 0, count: 0 });
      g.total += (updated - created) / 3_600_000;
      g.count += 1;
    });
    return Object.entries(groups).map(([priority, v]) => ({
      priority,
      hours: v.count ? +(v.total / v.count).toFixed(1) : 0,
    }));
  }, [defects]);

  return (
    <ReportsSubPageShell
      title="Performance Report"
      description="Throughput, mean time to resolution, and team load by priority."
      search={search}
      onChange={patch}
    >
      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Defects in window</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{defects.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Resolved</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {defects.filter((d) => d.status === "Fixed" || d.status === "Closed").length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Open</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {defects.filter((d) => d.status !== "Fixed" && d.status !== "Closed").length}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Mean Resolution Time by Priority (hours)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byPriority}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="priority" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="hours" fill="oklch(0.6 0.2 250)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </ReportsSubPageShell>
  );
}