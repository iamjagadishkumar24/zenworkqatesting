import { useMemo, useState } from "react";
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
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3 } from "lucide-react";
import { ExportMenu } from "@/components/qa/ExportMenu";
import type { Defect } from "@/lib/qa/types";

type DrillState = { title: string; rows: Defect[] } | null;

const ALL_COLUMNS: { key: keyof Defect | "validityLabel"; label: string }[] = [
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

function cellValue(d: Defect, key: string): string {
  if (key === "validityLabel") return d.validity ?? "Unverified";
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
  const [sortKey, setSortKey] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const rows = drill?.rows ?? [];

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = cellValue(a, sortKey);
      const bv = cellValue(b, sortKey);
      if (sortKey === "createdAt" || sortKey === "updatedAt") {
        const at = new Date(av).getTime();
        const bt = new Date(bv).getTime();
        return sortDir === "asc" ? at - bt : bt - at;
      }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const visibleCols = ALL_COLUMNS.filter((c) => visible.includes(String(c.key)));

  const exportRows = sorted.map((d) => {
    const r: Record<string, unknown> = {};
    visibleCols.forEach((c) => (r[c.label] = cellValue(d, String(c.key))));
    return r;
  });

  return (
    <Dialog open={!!drill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{drill?.title}</DialogTitle>
          <DialogDescription>
            {rows.length} matching error{rows.length === 1 ? "" : "s"}. Sort, paginate, or hide
            columns — exports respect what's shown.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
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
                  <Label key={String(c.key)} className="flex items-center gap-2 text-xs font-normal">
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

          <ExportMenu
            label="Export rows"
            filename="drill-down-defects"
            title={drill?.title ?? "Drill-down"}
            rows={exportRows}
            columns={visibleCols.map((c) => c.label)}
            filters={filters}
          />
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase">
              <tr>
                {visibleCols.map((c) => {
                  const active = sortKey === c.key;
                  return (
                    <th key={String(c.key)} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleSort(String(c.key))}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        {c.label}
                        {active ? (
                          sortDir === "asc" ? (
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
              {paged.map((d) => (
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
              {paged.length === 0 && (
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
            Showing {(currentPage - 1) * pageSize + (paged.length ? 1 : 0)}–
            {(currentPage - 1) * pageSize + paged.length} of {sorted.length}
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
              disabled={currentPage <= 1}
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
              disabled={currentPage >= totalPages}
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