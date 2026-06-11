import XLSXStyle from "xlsx-js-style";
import { toast } from "sonner";
import type { Defect, Environment } from "./types";

const HEADERS = [
  "Agent",
  "Section",
  "Error Description",
  "Expected Result / Outcome",
  "Screenshots / Recordings",
  "Link",
  "Jira Link if any",
  "Date Reported",
] as const;

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

export function exportReportedErrorsXlsx(defects: Defect[], env: Environment | null | undefined) {
  if (!defects.length) {
    toast.error("Nothing to export");
    return;
  }

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const envLabel = env ?? "All";
  const filename = `Zenwork_Error_Report_${envLabel}_${yyyy}-${mm}-${dd}.xlsx`;

  const rows: (string | number | Date | null)[][] = defects.map((d) => [
    d.createdBy ?? "",
    [d.module, d.formFeature].filter(Boolean).join(" / "),
    [d.description, d.actualResult].filter(Boolean).join("\n\n"),
    d.expectedResult ?? "",
    pickScreenshot(d),
    pickLink(d),
    d.jiraUrl ?? "",
    toDate(d.createdAt),
  ]);

  const aoa: (string | number | Date | null)[][] = [HEADERS as unknown as string[], ...rows];
  const ws = XLSXStyle.utils.aoa_to_sheet(aoa, { cellDates: true });

  // Column widths (auto-fit based on content, capped)
  const widths = HEADERS.map((h, ci) => {
    const max = Math.max(
      h.length,
      ...rows.map((r) => {
        const v = String(r[ci] ?? "");
        // For long text cols, cap measurement
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

  // Row heights for header
  ws["!rows"] = [{ hpt: 22 }];

  const wrapCols = new Set([2, 3]); // Error Description, Expected Result
  const linkCols = new Set([4, 5, 6]); // Screenshots, Link, Jira Link

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

  XLSXStyle.writeFile({ SheetNames: ["Reported Errors"], Sheets: { "Reported Errors": ws } }, filename);
  toast.success(`Exported ${filename}`);
}