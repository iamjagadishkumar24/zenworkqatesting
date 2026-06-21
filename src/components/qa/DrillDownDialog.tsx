import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Loader2 } from "lucide-react";
import { ExportMenu } from "@/components/qa/ExportMenu";
import {
  queryDefectsAll,
  queryDefectsPage,
  type DefectQuerySpec,
  type DefectRowLite,
  type DefectSort,
} from "@/lib/qa/defectsQuery";

export type DrillState = { title: string; spec: DefectQuerySpec } | null;

const ALL_COLUMNS: { key: keyof DefectRowLite; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "module", label: "Module" },
  { key: "formFeature", label: "Form / Feature" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "validityLabel", label: "Validity" },
  { key: "priority", label: "Priority" },
  { key: "severity", label: "Severity" },
  { key: "assignedAgent", label: "Assignee" },
  { key: "createdBy", label: "Reporter" },
  { key: "createdAt", label: "Created" },
  { key: "updatedAt", label: "Updated" },
];

const DEFAULT_VISIBLE = ["id", "module", "title", "status", "validityLabel", "assignedAgent"];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function cellValue(d: DefectRowLite, key: string): string {
  const v = (d as unknown as Record<string, unknown>)[key];
  if (v == null) return "";
  if (key === "createdAt" || key === "updatedAt") {
    return new Date(String(v)).toLocaleString();
  }
  return String(v);
}

export function DrillDownDialog({
  drill,
  onClose,
  filters,
}: {
  drill: DrillState;
  onClose: () => void;
  filters?: Record<string, unknown>;
}) {
  const [visible, setVisible] = useState<string[]>(DEFAULT_VISIBLE);
  const [sort, setSort] = useState<DefectSort>({ key: "createdAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<DefectRowLite[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportRows, setExportRows] = useState<DefectRowLite[] | null>(null);

  // Reset paging when the drill spec changes.
  const specKey = drill ? JSON.stringify(drill.spec) : "";
  useEffect(() => {
    setPage(1);
    setExportRows(null);
  }, [specKey]);

  // Server-side fetch — runs whenever spec, sort, page, or pageSize change.
  useEffect(() => {
    if (!drill) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    queryDefectsPage(drill.spec, sort, page, pageSize)
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load rows");
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drill, specKey, sort, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  const toggleSort = (key: string) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );
    setPage(1);
  };

  const visibleCols = ALL_COLUMNS.filter((c) => visible.includes(String(c.key)));

  // Lazy-load every matching row the first time the user opens an export.
  const ensureExportRows = async (): Promise<DefectRowLite[]> => {
    if (exportRows) return exportRows;
    if (!drill) return [];
    setExporting(true);
    try {
      const all = await queryDefectsAll(drill.spec, sort);
      setExportRows(all);
      return all;
    } finally {
      setExporting(false);
    }
  };

  const [stagedExport, setStagedExport] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    if (!exportRows) return;
    setStagedExport(
      exportRows.map((d) => {
        const r: Record<string, unknown> = {};
        visibleCols.forEach((c) => (r[c.label] = cellValue(d, String(c.key))));
        return r;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportRows, visible]);

  return (
    <Dialog open={!!drill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{drill?.title}</DialogTitle>
          <DialogDescription>
            {total} matching error{total === 1 ? "" : "s"} (server-paginated). Sort, paginate, or
            hide columns — exports respect what's shown.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns3 className="mr-2 h-4 w-4" />
                  Columns ({visible.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56">
                <div className="grid gap-1.5">
                  {ALL_COLUMNS.map((c) => (
                    <Label
                      key={String(c.key)}
                      className="flex items-center gap-2 text-xs font-normal"
                    >
                      <Checkbox
                        checked={visible.includes(String(c.key))}
                        onCheckedChange={(v) =>
                          setVisible((cur) =>
                            v
                              ? [...cur, String(c.key)]
                              : cur.filter((k) => k !== String(c.key)),
                          )
                        }
                      />
                      {c.label}
                    </Label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {loading && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </span>
            )}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              onClick={() => void ensureExportRows()}
            >
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Columns3 className="mr-2 h-4 w-4" />
              )}
              {exportRows ? `Loaded ${exportRows.length}` : "Prepare export"}
            </Button>
            <ExportMenu
              label="Export rows"
              filename="drill-down-defects"
              title={drill?.title ?? "Drill-down"}
              rows={stagedExport}
              columns={visibleCols.map((c) => c.label)}
              filters={filters}
            />
          </div>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase">
              <tr>
                {visibleCols.map((c) => {
                  const active = sort.key === c.key;
                  return (
                    <th key={String(c.key)} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleSort(String(c.key))}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {c.label}
                        {active ? (
                          sort.dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t">
                  {visibleCols.map((c) => (
                    <td
                      key={String(c.key)}
                      className={
                        c.key === "id" ? "px-3 py-2 font-mono text-xs" : "px-3 py-2"
                      }
                    >
                      {cellValue(d, String(c.key))}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-muted-foreground"
                    colSpan={visibleCols.length || 1}
                  >
                    No matching errors.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {(currentPage - 1) * pageSize + (rows.length ? 1 : 0)}–
            {(currentPage - 1) * pageSize + rows.length} of {total}
          </span>
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              className="h-7 rounded-md border bg-background px-1"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              disabled={currentPage <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span>
              Page {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              disabled={currentPage >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}