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

export const Route = createFileRoute("/_app/_admin/reports/audit")({
  validateSearch: validateSubSearch,
  component: AuditReportPage,
});

function AuditReportPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const defects = useFilteredSubPageDefects(search);
  const patch = (p: Partial<SubPageSearch>) =>
    nav({ replace: true, search: (prev: SubPageSearch) => ({ ...prev, ...p }) });

  const sorted = [...defects].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <ReportsSubPageShell
      title="Audit Report"
      description="Recent defect mutations filtered by state and error type."
      search={search}
      onChange={patch}
    >
      <Card>
        <CardHeader>
          <CardTitle>Recent updates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Updated</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Agent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No audit entries for the active filters.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.slice(0, 100).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">
                      {new Date(d.updatedAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.id.slice(0, 8)}</TableCell>
                    <TableCell>{d.state ?? "—"}</TableCell>
                    <TableCell>{d.module}</TableCell>
                    <TableCell>{d.status}</TableCell>
                    <TableCell>{d.assignedAgent || "—"}</TableCell>
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