import { describe, it, expect } from "vitest";
import { deadlineInfo, sortByDeadline } from "./deadline";
import type { RetestAssignment } from "./retest";

const NOW = 1_700_000_000_000;
const at = (ms: number) => new Date(NOW + ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("deadlineInfo labels", () => {
  it("returns sentinel info when deadline is missing", () => {
    expect(deadlineInfo(null, NOW)).toMatchObject({
      tier: "none",
      label: "—",
      shortLabel: "—",
      isOverdue: false,
    });
    expect(deadlineInfo(undefined, NOW).tier).toBe("none");
  });
  it("formats a multi-day countdown with padded h/m/s", () => {
    const info = deadlineInfo(at(2 * DAY + 4 * HOUR + 5 * 60_000 + 30_000), NOW);
    expect(info.label).toBe("2d 04h 05m 30s");
    expect(info.shortLabel).toBe("2d 04h 05m");
  });
  it("omits the day segment when under 24 hours", () => {
    const info = deadlineInfo(at(2 * HOUR + 3 * 60_000 + 4_000), NOW);
    expect(info.label).toBe("02h 03m 04s");
    expect(info.shortLabel).toBe("02h 03m");
  });
  it("renders overdue duration as a positive padded h/m", () => {
    const info = deadlineInfo(at(-(2 * HOUR + 5 * 60_000)), NOW);
    expect(info.isOverdue).toBe(true);
    expect(info.label).toBe("02h 05m");
    expect(info.msRemaining).toBeLessThan(0);
  });
});

describe("sortByDeadline", () => {
  const mk = (
    id: string,
    deadline: string | null,
    priority: RetestAssignment["priority"],
  ): RetestAssignment =>
    ({
      id,
      deadline_at: deadline,
      priority,
    }) as RetestAssignment;

  it("sorts soonest deadline first; null deadlines go to the end", () => {
    const a = mk("A", at(48 * HOUR), "Low");
    const b = mk("B", at(2 * HOUR), "Low");
    const c = mk("C", null, "Critical");
    expect(sortByDeadline([a, b, c]).map((x) => x.id)).toEqual(["B", "A", "C"]);
  });
  it("breaks ties by priority rank (Critical < High < Medium < Low)", () => {
    const t = at(HOUR);
    const a = mk("A", t, "Low");
    const b = mk("B", t, "Critical");
    const c = mk("C", t, "High");
    expect(sortByDeadline([a, b, c]).map((x) => x.id)).toEqual(["B", "C", "A"]);
  });
  it("does not mutate the input array", () => {
    const input = [mk("A", at(HOUR), "Low"), mk("B", at(2 * HOUR), "Low")];
    const snapshot = [...input];
    sortByDeadline(input);
    expect(input).toEqual(snapshot);
  });
});