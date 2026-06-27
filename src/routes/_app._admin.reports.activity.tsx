import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ReportsSubPageShell,
  useFilteredSubPageDefects,
  validateSubSearch,
  type SubPageSearch,
} from "@/components/qa/ReportsSubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const Route = createFileRoute("/_app/_admin/reports/activity")({
  validateSearch: validateSubSearch,
  component: ActivityPage,
});

function ActivityPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const defects = useFilteredSubPageDefects(search);
  const patch = (p: Partial<SubPageSearch>) =>
    nav({ replace: true, search: (prev: SubPageSearch) => ({ ...prev, ...p }) });

  const daily = useMemo(() => {
    const map: Record<string, number> = {};
    defects.forEach((d) => {
      const day = (d.createdAt ?? "").slice(0, 10);
      if (!day) return;
      map[day] = (map[day] ?? 0) + 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day, count }));
  }, [defects]);

  return (
    <ReportsSubPageShell
      title="Activity Report"
      description="Daily defect reporting volume across the selected state and error type."
      search={search}
      onChange={patch}
    >
      <Card>
        <CardHeader>
          <CardTitle>Defects per day</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="count"
                stroke="oklch(0.6 0.2 250)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </ReportsSubPageShell>
  );
}