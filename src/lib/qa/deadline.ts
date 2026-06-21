import type { RetestAssignment, RetestPriority } from "./retest";

export type DeadlineTier = "none" | "safe" | "soon" | "urgent" | "critical" | "overdue";

export type DeadlineInfo = {
  tier: DeadlineTier;
  msRemaining: number; // negative when overdue
  label: string; // "1d 04h 23m 15s" or "02h 15m"
  shortLabel: string; // compact: "1d 04h 23m"
  isOverdue: boolean;
};

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function deadlineInfo(
  deadlineAt: string | null | undefined,
  now: number = Date.now(),
): DeadlineInfo {
  if (!deadlineAt) {
    return { tier: "none", msRemaining: Infinity, label: "—", shortLabel: "—", isOverdue: false };
  }
  const target = new Date(deadlineAt).getTime();
  const ms = target - now;
  if (ms <= 0) {
    const over = -ms;
    const h = Math.floor(over / HOUR);
    const m = Math.floor((over % HOUR) / MIN);
    return {
      tier: "overdue",
      msRemaining: ms,
      label: `${pad(h)}h ${pad(m)}m`,
      shortLabel: `${pad(h)}h ${pad(m)}m`,
      isOverdue: true,
    };
  }
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  const s = Math.floor((ms % MIN) / 1000);
  const label =
    d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s` : `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  const shortLabel = d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}h ${pad(m)}m`;
  let tier: DeadlineTier;
  if (ms < HOUR) tier = "critical";
  else if (ms < 4 * HOUR) tier = "urgent";
  else if (ms < 24 * HOUR) tier = "soon";
  else tier = "safe";
  return { tier, msRemaining: ms, label, shortLabel, isOverdue: false };
}

const PRIORITY_RANK: Record<RetestPriority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

export function sortByDeadline(items: RetestAssignment[]): RetestAssignment[] {
  return [...items].sort((a, b) => {
    const at = a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity;
    const bt = b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity;
    if (at !== bt) return at - bt;
    return (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
  });
}

export const TIER_CLASSES: Record<DeadlineTier, string> = {
  none: "bg-muted text-muted-foreground border-border",
  safe: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
  soon: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
  urgent: "bg-red-500/10 text-red-600 border-red-500/30 dark:text-red-400",
  critical: "bg-red-500/15 text-red-600 border-red-500/40 dark:text-red-400 animate-pulse",
  overdue: "bg-red-600 text-white border-red-700 animate-pulse",
};
