import XLSXStyle from "xlsx-js-style";
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
  const wb = XLSXStyle.utils.book_new();
  if (meta && (meta.title || meta.filters)) {
    const metaRows: (string | number | null)[][] = [];
    if (meta.title) metaRows.push(["Report", meta.title]);
    metaRows.push(["Generated", new Date().toLocaleString()]);
    if (meta.filters) {
      metaRows.push([]);
      metaRows.push(["Applied filters"]);
      Object.entries(meta.filters).forEach(([k, v]) => metaRows.push([k, String(v ?? "")]));
    }
    const ws = XLSXStyle.utils.aoa_to_sheet(metaRows);
    ws["!cols"] = [{ wch: 22 }, { wch: 60 }];
    XLSXStyle.utils.book_append_sheet(wb, ws, "Info");
  }
  for (const s of sheets) {
    if (!s.rows.length) continue;
    const cols = s.columns?.length ? s.columns : Object.keys(s.rows[0]);
    const ws = buildStyledSheet(cols, s.rows);
    XLSXStyle.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const fname = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSXStyle.writeFile(wb, fname);
  toast.success(`Exported ${fname}`);
}

const WRAP_HINTS = ["description", "notes", "comments", "steps", "expected", "actual", "body", "outcome", "details", "summary"];
const DATE_HINTS = ["date", "created", "updated", "reported", "completed", "due", "_at"];
const URL_RE = /^https?:\/\//i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function isWrapCol(header: string) {
  const h = header.toLowerCase();
  return WRAP_HINTS.some((k) => h.includes(k));
}
function isDateCol(header: string) {
  const h = header.toLowerCase();
  return DATE_HINTS.some((k) => h.includes(k));
}

function coerce(value: unknown, header: string): string | number | Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "boolean") return typeof value === "boolean" ? String(value) : value;
  if (typeof value === "string") {
    if (isDateCol(header) && ISO_DATE_RE.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return value;
  }
  try { return JSON.stringify(value); } catch { return String(value); }
}

function buildStyledSheet(cols: string[], rows: ExportRow[]) {
  const aoa: (string | number | Date | null)[][] = [
    cols,
    ...rows.map((r) => cols.map((c) => coerce((r as ExportRow)[c], c))),
  ];
  const ws = XLSXStyle.utils.aoa_to_sheet(aoa, { cellDates: true });

  const widths = cols.map((c, ci) => {
    const max = Math.max(
      c.length,
      ...rows.map((r) => {
        const v = (r as ExportRow)[c];
        if (v instanceof Date) return 19;
        const s = String(v ?? "");
        return s.split("\n").reduce((m, line) => Math.max(m, line.length), 0);
      }),
    );
    return { wch: Math.min(Math.max(max + 2, 12), 60) };
  });
  ws["!cols"] = widths;

  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: "1F2937" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "CBD5E1" } },
      bottom: { style: "thin", color: { rgb: "CBD5E1" } },
      left: { style: "thin", color: { rgb: "CBD5E1" } },
      right: { style: "thin", color: { rgb: "CBD5E1" } },
    },
  };
  cols.forEach((_, ci) => {
    const addr = XLSXStyle.utils.encode_cell({ r: 0, c: ci });
    if (ws[addr]) ws[addr].s = headerStyle;
  });
  ws["!rows"] = [{ hpt: 22 }];

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols.length; c++) {
      const addr = XLSXStyle.utils.encode_cell({ r: r + 1, c });
      const cell = ws[addr];
      if (!cell) continue;
      const style: Record<string, unknown> = {
        alignment: { vertical: "top", wrapText: isWrapCol(cols[c]) },
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };
      if (typeof cell.v === "string" && URL_RE.test(cell.v)) {
        cell.l = { Target: cell.v, Tooltip: "Open link" };
        style.font = { color: { rgb: "1D4ED8" }, underline: true };
      }
      if (cell.v instanceof Date) {
        cell.t = "d";
        cell.z = "yyyy-mm-dd hh:mm";
      }
      cell.s = style;
    }
  }
  return ws;
}