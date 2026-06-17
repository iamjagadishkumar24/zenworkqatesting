import XLSXStyle from "xlsx-js-style";
import { toast } from "sonner";
import type { Defect, Environment } from "./types";
import { extractDefectId } from "./retestLink";

export const REPORTED_ERROR_HEADERS = [
  "Date Reported",
  "Agent Name",
  "Section / Form / Module",
  "Error Description",
  "Expected Result / Outcome",
  "Priority",
  "Screenshots / Recordings Link",
  "General Link",
  "Jira Link",
  "Additional Comments",
  "Admin Review Status",
  "Retest Status",
  "Retest Comments",
  "Retest Updated Date",
] as const;

const HEADERS = REPORTED_ERROR_HEADERS;

export type ReportedErrorRow = {
  reportedAt: string | null;
  agent: string;
  /** legacy alias kept so existing UI tables that read `r.section` still work. */
  section: string;
  description: string;
  expected: string;
  priority: string;
  screenshot: string;
  link: string;
  jira: string;
  comments: string;
  adminReview: string;
  retestStatus: string;
  retestComments: string;
  retestUpdatedAt: string | null;
};

export type RetestSummary = {
  defectId: string;
  status: string;
  comments: string;
  updatedAt: string | null;
};

function adminReviewLabel(d: Defect): string {
  if (d.validity === "Invalid") return "Invalid Error";
  if (d.validity === "Valid" && (d.status === "Reported" || d.status === "Pending")) return "Valid Error";
  if (d.status === "Retest Required") return "Retest Required";
  if (d.status === "Fixed" || d.status === "Closed") return "Fixed";
  if (d.status === "Ongoing" || d.status === "In Progress") return "Ongoing";
  return "Pending";
}

export function toReportedErrorRow(d: Defect, retest?: RetestSummary | null): ReportedErrorRow {
  const all = d.comments ?? [];
  const own = all.filter((c) => c.author === d.createdBy);
  const fmtComments = (xs: typeof all) =>
    xs.map((c) => `${c.author}: ${c.text}`).join("\n\n");
  return {
    reportedAt: d.createdAt || null,
    agent: d.createdBy ?? "",
    section: [d.module, d.formFeature].filter(Boolean).join(" / "),
    description: d.description ?? "",
    expected: d.expectedResult ?? "",
    priority: d.priority ?? "",
    screenshot: pickScreenshot(d),
    link: pickLink(d),
    jira: d.jiraUrl ?? "",
    comments: fmtComments(own),
    adminReview: adminReviewLabel(d),
    retestStatus: retest?.status ?? "",
    retestComments: retest?.comments ?? "",
    retestUpdatedAt: retest?.updatedAt ?? null,
  };
}

export function buildReportedErrorsFilename(env: Environment | null | undefined, when: Date = new Date()): string {
  const yyyy = when.getFullYear();
  const mm = String(when.getMonth() + 1).padStart(2, "0");
  const dd = String(when.getDate()).padStart(2, "0");
  const envLabel = env ?? "All";
  return `Zenwork_Error_Report_${envLabel}_${yyyy}-${mm}-${dd}.xlsx`;
}

function rowToTuple(r: ReportedErrorRow): (string | number | Date | null)[] {
  return [
    r.reportedAt ? toDate(r.reportedAt) : null,
    r.agent,
    r.section,
    r.description,
    r.expected,
    r.priority,
    r.screenshot,
    r.link,
    r.jira,
    r.comments,
    r.adminReview,
    r.retestStatus,
    r.retestComments,
    r.retestUpdatedAt ? toDate(r.retestUpdatedAt) : null,
  ];
}

/** Pure builder usable in browser or server runtime. Returns a workbook buffer. */
export function buildReportedErrorsWorkbook(
  defects: Defect[],
  retestsByDefectId?: Map<string, RetestSummary>,
): ArrayBuffer {
  const rowsTyped: (string | number | Date | null)[][] = defects.map((d) =>
    rowToTuple(toReportedErrorRow(d, retestsByDefectId?.get(d.id) ?? null)),
  );
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

  // Column indices for the simplified layout (see REPORTED_ERROR_HEADERS).
  // 0:Date 1:Agent 2:Section 3:Desc 4:Expected 5:Priority 6:Screenshot 7:Link
  // 8:Jira 9:AdditionalComments 10:AdminReview 11:RetestStatus 12:RetestComments 13:RetestUpdated
  const wrapCols = new Set([3, 4, 9, 12]);
  const linkCols = new Set([6, 7, 8]);
  const dateCols = new Set([0, 13]);
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
      if (dateCols.has(c) && cell.v instanceof Date) {
        cell.t = "d";
        cell.z = "yyyy-mm-dd hh:mm";
      }
      cell.s = baseStyle;
    }
  }
  return ws;
}

export function exportReportedErrorsXlsx(
  defects: Defect[],
  env: Environment | null | undefined,
  retestsByDefectId?: Map<string, RetestSummary>,
) {
  if (!defects.length) {
    toast.info("No reported errors available to export.");
    return;
  }
  const filename = buildReportedErrorsFilename(env);
  const rowsTyped: (string | number | Date | null)[][] = defects.map((d) =>
    rowToTuple(toReportedErrorRow(d, retestsByDefectId?.get(d.id) ?? null)),
  );
  const ws = buildSheet(rowsTyped);
  XLSXStyle.writeFile({ SheetNames: ["Reported Errors"], Sheets: { "Reported Errors": ws } }, filename);
  toast.success(`Exported ${filename}`);
}

// Re-exported for callers that build retest lookups
export { extractDefectId };