import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ReportsSubPageShell,
  useFilteredSubPageDefects,
  validateSubSearch,
  type SubPageSearch,
} from "@/components/qa/ReportsSubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMemo } from "react";

export const Route = createFileRoute("/_app/_admin/reports/user")({
  validateSearch: validateSubSearch,
  component: UserReportPage,
});

function UserReportPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const defects = useFilteredSubPageDefects(search);
  const patch = (p: Partial<SubPageSearch>) =>
    nav({ replace: true, search: (prev: SubPageSearch) => ({ ...prev, ...p }) });

  const rows = useMemo(() => {
    const map: Record<string, { user: string; reported: number; assigned: number }> = {};
    defects.forEach((d) => {
      if (d.createdBy) {
        const r = (map[d.createdBy] ??= { user: d.createdBy, reported: 0, assigned: 0 });
        r.reported += 1;
      }
      if (d.assignedAgent) {
        const r = (map[d.assignedAgent] ??= {
          user: d.assignedAgent,
          reported: 0,
          assigned: 0,
        });
        r.assigned += 1;
      }
    });
    return Object.values(map).sort((a, b) => b.reported + b.assigned - (a.reported + a.assigned));
  }, [defects]);

  return (
    <ReportsSubPageShell
      title="User Report"
      description="Per-user reporting and assignment volume in the selected window."
      search={search}
      onChange={patch}
    >
      <Card>
        <CardHeader>
          <CardTitle>Per-user activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="text-right">Reported</TableHead>
                <TableHead className="text-right">Assigned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                    No activity for the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.user}>
                    <TableCell>{r.user}</TableCell>
                    <TableCell className="text-right">{r.reported}</TableCell>
                    <TableCell className="text-right">{r.assigned}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </ReportsSubPageShell>
  );
}