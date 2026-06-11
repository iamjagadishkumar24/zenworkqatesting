import XLSXStyle from "xlsx-js-style";
import { toast } from "sonner";
import type { Defect, Environment } from "./types";

export const REPORTED_ERROR_HEADERS = [
  "Agent",
  "Section",
  "Error Description",
  "Expected Result / Outcome",
  "Screenshots / Recordings",
  "Link",
  "Jira Link if any",
  "Date Reported",
] as const;

const HEADERS = REPORTED_ERROR_HEADERS;

export type ReportedErrorRow = {
  agent: string;
  section: string;
  description: string;
  expected: string;
  screenshot: string;
  link: string;
  jira: string;
  reportedAt: string | null;
};

export function toReportedErrorRow(d: Defect): ReportedErrorRow {
  return {
    agent: d.createdBy ?? "",
    section: [d.module, d.formFeature].filter(Boolean).join(" / "),
    description: [d.description, d.actualResult].filter(Boolean).join("\n\n"),
    expected: d.expectedResult ?? "",
    screenshot: pickScreenshot(d),
    link: pickLink(d),
    jira: d.jiraUrl ?? "",
    reportedAt: d.createdAt || null,
  };
}

export function buildReportedErrorsFilename(env: Environment | null | undefined, when: Date = new Date()): string {
  const yyyy = when.getFullYear();
  const mm = String(when.getMonth() + 1).padStart(2, "0");
  const dd = String(when.getDate()).padStart(2, "0");
  const envLabel = env ?? "All";
  return `Zenwork_Error_Report_${envLabel}_${yyyy}-${mm}-${dd}.xlsx`;
}

/** Pure builder usable in browser or server runtime. Returns a workbook buffer. */
export function buildReportedErrorsWorkbook(defects: Defect[]): ArrayBuffer {
  const rowsTyped: (string | number | Date | null)[][] = defects.map((d) => {
    const r = toReportedErrorRow(d);
    return [r.agent, r.section, r.description, r.expected, r.screenshot, r.link, r.jira, r.reportedAt ? toDate(r.reportedAt) : null];
  });
  const ws = buildSheet(rowsTyped);
  const buf = XLSXStyle.write(
    { SheetNames: ["Reported Errors"], Sheets: { "Reported Errors": ws } },
    { bookType: "xlsx", type: "array" },
  );
  return buf as ArrayBuffer;
}

function toDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function pickScreenshot(d: Defect): string {
  return d.screenshotUrl || d.videoUrl || d.attachmentUrl || d.attachmentUrl2 || d.evidenceUrl || d.excelUrl || "";
}

function pickLink(d: Defect): string {
  return d.driveUrl || d.evidenceUrl || "";
}

function buildSheet(rows: (string | number | Date | null)[][]) {
  const aoa: (string | number | Date | null)[][] = [HEADERS as unknown as string[], ...rows];
  const ws = XLSXStyle.utils.aoa_to_sheet(aoa, { cellDates: true });

  const widths = HEADERS.map((h, ci) => {
    const max = Math.max(
      h.length,
      ...rows.map((r) => {
        const v = String(r[ci] ?? "");
        const longest = v.split("\n").reduce((m, line) => Math.max(m, line.length), 0);
        return Math.min(longest, 60);
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
  HEADERS.forEach((_, ci) => {
    const addr = XLSXStyle.utils.encode_cell({ r: 0, c: ci });
    if (ws[addr]) ws[addr].s = headerStyle;
  });
  ws["!rows"] = [{ hpt: 22 }];

  const wrapCols = new Set([2, 3]);
  const linkCols = new Set([4, 5, 6]);
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < HEADERS.length; c++) {
      const addr = XLSXStyle.utils.encode_cell({ r: r + 1, c });
      const cell = ws[addr];
      if (!cell) continue;
      const baseStyle: Record<string, unknown> = {
        alignment: { vertical: "top", wrapText: wrapCols.has(c) },
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };
      if (linkCols.has(c) && typeof cell.v === "string" && /^https?:\/\//i.test(cell.v)) {
        cell.l = { Target: cell.v, Tooltip: "Open link" };
        baseStyle.font = { color: { rgb: "1D4ED8" }, underline: true };
      }
      if (c === 7 && cell.v instanceof Date) {
        cell.t = "d";
        cell.z = "yyyy-mm-dd hh:mm";
      }
      cell.s = baseStyle;
    }
  }
  return ws;
}

export function exportReportedErrorsXlsx(defects: Defect[], env: Environment | null | undefined) {
  if (!defects.length) {
    toast.error("Nothing to export");
    return;
  }
  const filename = buildReportedErrorsFilename(env);
  const rowsTyped: (string | number | Date | null)[][] = defects.map((d) => {
    const r = toReportedErrorRow(d);
    return [r.agent, r.section, r.description, r.expected, r.screenshot, r.link, r.jira, r.reportedAt ? toDate(r.reportedAt) : null];
  });
  const ws = buildSheet(rowsTyped);
  XLSXStyle.writeFile({ SheetNames: ["Reported Errors"], Sheets: { "Reported Errors": ws } }, filename);
  toast.success(`Exported ${filename}`);
}