import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ReportsSubPageShell,
  useFilteredSubPageDefects,
  validateSubSearch,
  type SubPageSearch,
} from "@/components/qa/ReportsSubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportMenu } from "@/components/qa/ExportMenu";

export const Route = createFileRoute("/_app/_admin/reports/export-center")({
  validateSearch: validateSubSearch,
  component: ExportCenterPage,
});

function ExportCenterPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const defects = useFilteredSubPageDefects(search);
  const patch = (p: Partial<SubPageSearch>) =>
    nav({ replace: true, search: (prev: SubPageSearch) => ({ ...prev, ...p }) });

  const rows = defects.map((d) => ({
    id: d.id,
    state: d.state ?? "",
    module: d.module,
    title: d.title,
    status: d.status,
    priority: d.priority,
    severity: d.severity,
    assignedAgent: d.assignedAgent,
    createdAt: d.createdAt,
  })) as unknown as Record<string, unknown>[];

  return (
    <ReportsSubPageShell
      title="Export Center"
      description="Export filtered defect data to CSV, XLSX, or PDF."
      search={search}
      onChange={patch}
      actions={
        <ExportMenu
          label="Export filtered defects"
          filename="defects-export"
          title="Filtered Defects"
          rows={rows}
          columns={[
            "id",
            "state",
            "module",
            "title",
            "status",
            "priority",
            "severity",
            "assignedAgent",
            "createdAt",
          ]}
        />
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>Preview ({defects.length} rows)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Adjust the filters above, then export to your preferred format using the action in the
            top-right.
          </p>
        </CardContent>
      </Card>
    </ReportsSubPageShell>
  );
}