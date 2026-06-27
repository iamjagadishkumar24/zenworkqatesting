import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Defect } from "@/lib/qa/types";
import { US_STATES, isValidUsState } from "@/lib/qa/constants";
import { Link } from "@tanstack/react-router";

const PALETTE = [
  "oklch(0.6 0.2 250)",
  "oklch(0.62 0.17 150)",
  "oklch(0.7 0.2 50)",
  "oklch(0.6 0.22 27)",
  "oklch(0.55 0.18 300)",
  "oklch(0.65 0.16 200)",
];

/**
 * Dashboard widget that aggregates State Filing defects across multiple
 * dimensions (state, status, priority, assigned agent, recent activity). Only
 * defects with a USPS state code are considered "State Filing" rows.
 */
export function StateFilingWidgets({ defects }: { defects: Defect[] }) {
  const stateRows = useMemo(
    () => defects.filter((d) => d.state && isValidUsState(d.state)),
    [defects],
  );

  const byState = useMemo(() => {
    const map: Record<string, number> = {};
    stateRows.forEach((d) => {
      map[d.state as string] = (map[d.state as string] ?? 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([code, count]) => ({ code, count }));
  }, [stateRows]);

  const byStatus = useMemo(
    () => count(stateRows, (d) => d.status || "Unknown"),
    [stateRows],
  );
  const byPriority = useMemo(
    () => count(stateRows, (d) => d.priority || "Unspecified"),
    [stateRows],
  );
  const byAgent = useMemo(
    () => count(stateRows, (d) => d.assignedAgent || "Unassigned").slice(0, 8),
    [stateRows],
  );

  const byDay = useMemo(() => {
    const map: Record<string, number> = {};
    const cutoff = Date.now() - 30 * 86_400_000;
    stateRows.forEach((d) => {
      const t = new Date(d.createdAt).getTime();
      if (!Number.isFinite(t) || t < cutoff) return;
      const day = d.createdAt.slice(0, 10);
      map[day] = (map[day] ?? 0) + 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, count]) => ({ day, count }));
  }, [stateRows]);

  if (stateRows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-lg font-semibold">State Filing Defects</h2>
          <p className="text-xs text-muted-foreground">
            Cross-cutting view of defects flagged against U.S. state filings.
          </p>
        </div>
        <Link
          to="/reports"
          className="text-xs font-medium text-primary hover:underline"
          search={{
            status: "all",
            testingType: "all",
            category: "all",
            agent: "all",
            dateRange: "all",
            fromDate: "",
            toDate: "",
            state: "all",
          }}
        >
          Open full reports →
        </Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top states by defect volume</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byState}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="code" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip
                  labelFormatter={(c: string) =>
                    US_STATES.find((s) => s.code === c)?.name ?? c
                  }
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {byState.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By status</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byStatus}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={80}
                  label
                >
                  {byStatus.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By priority</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPriority} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" allowDecimals={false} fontSize={11} />
                <YAxis dataKey="name" type="category" fontSize={11} width={90} />
                <Tooltip />
                <Bar dataKey="value" fill="oklch(0.6 0.2 250)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top assigned agents</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byAgent} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" allowDecimals={false} fontSize={11} />
                <YAxis dataKey="name" type="category" fontSize={11} width={120} />
                <Tooltip />
                <Bar dataKey="value" fill="oklch(0.62 0.17 150)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Last 30 days</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" fontSize={10} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" fill="oklch(0.6 0.2 250)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function count(rows: Defect[], pick: (d: Defect) => string) {
  const map: Record<string, number> = {};
  rows.forEach((d) => {
    const k = pick(d);
    map[k] = (map[k] ?? 0) + 1;
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
}