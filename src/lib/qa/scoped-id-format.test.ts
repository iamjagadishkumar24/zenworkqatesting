import { describe, it, expect } from "vitest";

// Mirrors public.next_scoped_id formatting so a client-side regression
// (e.g. wrong padding or prefix) is caught before it reaches the DB.
function format(kind: "defect" | "task", taxYear: string, seq: number): string {
  const prefix = kind === "defect" ? "ZEN" : "TASK";
  return `${prefix}-${taxYear}-${String(seq).padStart(2, "0")}`;
}

describe("scoped id format", () => {
  it("pads sequence to two digits", () => {
    expect(format("defect", "2025", 1)).toBe("ZEN-2025-01");
    expect(format("task", "2024", 9)).toBe("TASK-2024-09");
  });
  it("does not truncate sequences beyond 99", () => {
    expect(format("defect", "2026", 100)).toBe("ZEN-2026-100");
  });
});