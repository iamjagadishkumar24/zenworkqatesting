import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...a: any[]) => h.toastError(...a),
    success: (...a: any[]) => h.toastSuccess(...a),
  },
}));
vi.mock("xlsx-js-style", () => ({
  default: {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: () => ({}),
      book_append_sheet: vi.fn(),
    },
  },
}));

import { pickColumns, exportCsv } from "./export";

describe("pickColumns", () => {
  it("projects only the requested columns and fills missing with empty string", () => {
    const rows = [
      { a: 1, b: 2, c: 3 },
      { a: 10, b: 20 },
    ];
    expect(pickColumns(rows, ["a", "c"])).toEqual([
      { a: 1, c: 3 },
      { a: 10, c: "" },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(pickColumns([], ["a"])).toEqual([]);
  });
});

describe("exportCsv", () => {
  beforeEach(() => {
    h.toastError.mockClear();
    h.toastSuccess.mockClear();
    (URL as any).createObjectURL = vi.fn(() => "blob:fake");
    (URL as any).revokeObjectURL = vi.fn();
  });

  it("toasts an error and does not download when rows are empty", () => {
    exportCsv("out.csv", []);
    expect(h.toastError).toHaveBeenCalledWith("Nothing to export");
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it("derives columns from the first row when none are passed", () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    exportCsv("data", [{ a: 1, b: "x" }]);
    expect(clickSpy).toHaveBeenCalled();
    expect(h.toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/data\.csv/));
    clickSpy.mockRestore();
  });

  it("respects an explicit filename with .csv suffix", () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    exportCsv("report.csv", [{ a: 1 }], ["a"]);
    expect(h.toastSuccess).toHaveBeenCalledWith("Exported report.csv");
    clickSpy.mockRestore();
  });
});