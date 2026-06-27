import { describe, it, expect } from "vitest";
import { deadlineInfo, TIER_CLASSES } from "./deadline";

const NOW = 1_700_000_000_000;
const at = (ms: number) => new Date(NOW + ms).toISOString();
const HOUR = 3_600_000;

describe("deadlineInfo tier thresholds", () => {
  it("returns 'safe' (green) when more than 24h remain", () => {
    const info = deadlineInfo(at(48 * HOUR), NOW);
    expect(info.tier).toBe("safe");
    expect(info.isOverdue).toBe(false);
    expect(TIER_CLASSES.safe).toMatch(/emerald/);
  });

  it("returns 'soon' (amber) when less than 24h remain", () => {
    const info = deadlineInfo(at(10 * HOUR), NOW);
    expect(info.tier).toBe("soon");
    expect(TIER_CLASSES.soon).toMatch(/amber/);
  });

  it("returns 'urgent' (red) when less than 4h remain", () => {
    const info = deadlineInfo(at(3 * HOUR), NOW);
    expect(info.tier).toBe("urgent");
    expect(TIER_CLASSES.urgent).toMatch(/red/);
  });

  it("returns 'critical' (flashing red) when less than 1h remain", () => {
    const info = deadlineInfo(at(30 * 60_000), NOW);
    expect(info.tier).toBe("critical");
    expect(TIER_CLASSES.critical).toMatch(/motion-safe:animate-pulse/);
  });

  it("respects reduced-motion via motion-safe prefix on flashing tiers", () => {
    expect(TIER_CLASSES.critical).not.toMatch(/(^| )animate-pulse/);
    expect(TIER_CLASSES.overdue).toMatch(/motion-safe:animate-pulse/);
    expect(TIER_CLASSES.overdue).not.toMatch(/(^| )animate-pulse/);
  });

  it("marks overdue when the deadline has passed", () => {
    const info = deadlineInfo(at(-HOUR), NOW);
    expect(info.tier).toBe("overdue");
    expect(info.isOverdue).toBe(true);
  });
});
