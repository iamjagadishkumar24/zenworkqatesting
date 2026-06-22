import { describe, it, expect, vi } from "vitest";
import {
  REPORTED_ERROR_HEADERS,
  toReportedErrorRow,
  buildReportedErrorsFilename,
  buildReportedErrorsWorkbook,
  exportReportedErrorsXlsx,
} from "./exportReportedErrors";
import type { Defect } from "./types";

vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock("xlsx-js-style", async () => {
  const actual = await vi.importActual<typeof import("xlsx-js-style")>("xlsx-js-style");
  return { ...actual, default: { ...actual, writeFile: vi.fn() } };
});

function d(over: Partial<Defect> = {}): Defect {
  return {
    id: "ZEN-1",
    module: "1099 Forms",
    formFeature: "Form 1099-NEC",
    title: "t",
    description: "Desc",
    stepsToReproduce: "",
    expectedResult: "Expected x",
    actualResult: "",
    status: "Reported",
    priority: "High",
    severity: "High",
    validity: "Unverified",
    environment: "Production",
    assignedAgent: "Alice",
    createdAt: "2026-01-15T10:30:00.000Z",
    updatedAt: "2026-01-15T10:30:00.000Z",
    updatedBy: "Alice",
    createdBy: "Alice",
    comments: [],
    ...over,
  };
}

describe("buildReportedErrorsFilename", () => {
  it("includes env, date, and .xlsx extension", () => {
    expect(buildReportedErrorsFilename("Production", new Date("2026-03-04T00:00:00Z"))).toBe(
      "Zenwork_Error_Report_Production_2026-03-04.xlsx",
    );
  });
  it("defaults env label to 'All' when env is null/undefined", () => {
    expect(buildReportedErrorsFilename(null, new Date("2026-12-09T00:00:00Z"))).toBe(
      "Zenwork_Error_Report_All_2026-12-09.xlsx",
    );
    expect(buildReportedErrorsFilename(undefined, new Date("2026-12-09T00:00:00Z"))).toBe(
      "Zenwork_Error_Report_All_2026-12-09.xlsx",
    );
  });
});

describe("toReportedErrorRow + adminReviewLabel branches", () => {
  it("returns 'Invalid Error' when validity is Invalid", () => {
    expect(toReportedErrorRow(d({ validity: "Invalid" })).adminReview).toBe("Invalid Error");
  });
  it("returns 'Valid Error' for Valid + Reported|Pending", () => {
    expect(toReportedErrorRow(d({ validity: "Valid", status: "Reported" })).adminReview).toBe("Valid Error");
    expect(toReportedErrorRow(d({ validity: "Valid", status: "Pending" })).adminReview).toBe("Valid Error");
  });
  it("returns 'Retest Required'", () => {
    expect(toReportedErrorRow(d({ status: "Retest Required" })).adminReview).toBe("Retest Required");
  });
  it("returns 'Fixed' for Fixed/Closed", () => {
    expect(toReportedErrorRow(d({ status: "Fixed" })).adminReview).toBe("Fixed");
    expect(toReportedErrorRow(d({ status: "Closed" })).adminReview).toBe("Fixed");
  });
  it("returns 'Ongoing' for Ongoing/In Progress", () => {
    expect(toReportedErrorRow(d({ status: "Ongoing" })).adminReview).toBe("Ongoing");
    expect(toReportedErrorRow(d({ status: "In Progress" })).adminReview).toBe("Ongoing");
  });
  it("returns 'Pending' as the default fallback", () => {
    expect(toReportedErrorRow(d()).adminReview).toBe("Pending");
  });
  it("filters comments to those authored by createdBy and joins author: text", () => {
    const r = toReportedErrorRow(
      d({
        createdBy: "Alice",
        comments: [
          { id: "1", author: "Alice", text: "mine", createdAt: "" } as any,
          { id: "2", author: "Bob", text: "not mine", createdAt: "" } as any,
          { id: "3", author: "Alice", text: "mine2", createdAt: "" } as any,
        ],
      }),
    );
    expect(r.comments).toBe("Alice: mine\n\nAlice: mine2");
  });
  it("includes retest summary fields when provided", () => {
    const r = toReportedErrorRow(d(), {
      defectId: "ZEN-1",
      status: "Completed",
      comments: "rc",
      updatedAt: "2026-02-02T00:00:00Z",
    });
    expect(r.retestStatus).toBe("Completed");
    expect(r.retestComments).toBe("rc");
    expect(r.retestUpdatedAt).toBe("2026-02-02T00:00:00Z");
  });
  it("prefers screenshotUrl over fallbacks; falls through to evidenceUrl when others empty", () => {
    expect(toReportedErrorRow(d({ screenshotUrl: "a", videoUrl: "b" } as any)).screenshot).toBe("a");
    expect(toReportedErrorRow(d({ evidenceUrl: "e" } as any)).screenshot).toBe("e");
    expect(toReportedErrorRow(d()).screenshot).toBe("");
  });
  it("link prefers driveUrl then evidenceUrl", () => {
    expect(toReportedErrorRow(d({ driveUrl: "d", evidenceUrl: "e" } as any)).link).toBe("d");
    expect(toReportedErrorRow(d({ evidenceUrl: "e" } as any)).link).toBe("e");
    expect(toReportedErrorRow(d()).link).toBe("");
  });
});

describe("buildReportedErrorsWorkbook", () => {
  it("returns a non-empty ArrayBuffer with the headers row first", async () => {
    const buf = buildReportedErrorsWorkbook([d({ description: "Hello" })]);
    expect(buf.byteLength).toBeGreaterThan(0);
    // Round-trip via the same lib to sanity-check headers and the body row.
    const XLSX = (await import("xlsx-js-style")).default;
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(aoa[0]).toEqual([...REPORTED_ERROR_HEADERS]);
    expect(aoa[1][3]).toBe("Hello");
  });
});

describe("exportReportedErrorsXlsx", () => {
  it("shows an info toast and writes nothing when defects is empty", async () => {
    const { toast } = await import("sonner");
    const XLSX = (await import("xlsx-js-style")).default;
    exportReportedErrorsXlsx([], "Production");
    expect((toast.info as any)).toHaveBeenCalled();
    expect((XLSX.writeFile as any)).not.toHaveBeenCalled();
  });

  it("writes a file and shows a success toast when there are defects", async () => {
    const { toast } = await import("sonner");
    const XLSX = (await import("xlsx-js-style")).default;
    (XLSX.writeFile as any).mockClear();
    (toast.success as any).mockClear();
    exportReportedErrorsXlsx([d()], "Stage");
    expect((XLSX.writeFile as any)).toHaveBeenCalledTimes(1);
    const [_wb, filename] = (XLSX.writeFile as any).mock.calls[0];
    expect(filename).toMatch(/^Zenwork_Error_Report_Stage_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect((toast.success as any)).toHaveBeenCalledWith(`Exported ${filename}`);
  });
});