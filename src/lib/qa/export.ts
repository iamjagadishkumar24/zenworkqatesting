import * as XLSX from "xlsx";
import { toast } from "sonner";

export type ExportRow = Record<string, unknown>;

export function pickColumns<T extends ExportRow>(rows: T[], columns: string[]): ExportRow[] {
  return rows.map((r) => {
    const out: ExportRow = {};
    for (const c of columns) out[c] = (r as ExportRow)[c] ?? "";
    return out;
  });
}

export function exportCsv(filename: string, rows: ExportRow[], columns?: string[]) {
  if (!rows.length) return toast.error("Nothing to export");
  const cols = columns?.length ? columns : Object.keys(rows[0]);
  const data = pickColumns(rows, cols);
  const headers = cols.join(",");
  const body = data
    .map((r) => cols.map((h) => JSON.stringify(r[h] ?? "")).join(","))
    .join("\n");
  const blob = new Blob([headers + "\n" + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${a.download}`);
}

export function exportXlsx(
  filename: string,
  sheets: { name: string; rows: ExportRow[]; columns?: string[] }[],
  meta?: { title?: string; filters?: Record<string, unknown> },
) {
  const wb = XLSX.utils.book_new();
  if (meta && (meta.title || meta.filters)) {
    const metaRows: (string | number | null)[][] = [];
    if (meta.title) metaRows.push(["Report", meta.title]);
    metaRows.push(["Generated", new Date().toLocaleString()]);
    if (meta.filters) {
      metaRows.push([]);
      metaRows.push(["Applied filters"]);
      Object.entries(meta.filters).forEach(([k, v]) => metaRows.push([k, String(v ?? "")]));
    }
    const ws = XLSX.utils.aoa_to_sheet(metaRows);
    ws["!cols"] = [{ wch: 22 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws, "Info");
  }
  for (const s of sheets) {
    if (!s.rows.length) continue;
    const cols = s.columns?.length ? s.columns : Object.keys(s.rows[0]);
    const data = pickColumns(s.rows, cols);
    const ws = XLSX.utils.json_to_sheet(data, { header: cols });
    ws["!cols"] = cols.map((c) => ({
      wch: Math.min(50, Math.max(c.length + 2, ...data.map((r) => String(r[c] ?? "").length + 2))),
    }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const fname = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, fname);
  toast.success(`Exported ${fname}`);
}