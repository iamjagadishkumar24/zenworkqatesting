import type { Defect } from "./types";

export type FilterState = {
  q?: string;
  module?: string;
  status?: string;
  priority?: string;
  severity?: string;
  validity?: string;
  assignedAgent?: string;
  scope?: string;
  quick?: string;
};

/**
 * Validate filter combinations and return human-readable conflict messages.
 * Only returns warnings for combinations that are logically incompatible
 * or that the current dataset cannot satisfy.
 */
export function validateFilters(filters: FilterState, defects: Defect[]): string[] {
  const warnings: string[] = [];
  const f = filters;

  // Logically incompatible status × validity combos
  if (f.validity === "Invalid" && (f.status === "Fixed" || f.status === "Closed")) {
    warnings.push(
      `Filter conflict: validity "Invalid" rarely combines with status "${f.status}". Invalid defects are usually still open.`,
    );
  }
  if (f.validity === "Valid" && f.status === "Reported") {
    warnings.push(
      `Filter conflict: a "Valid" verdict is set after triage, so very few "Reported" defects will match.`,
    );
  }
  if (f.quick === "open" && (f.status === "Fixed" || f.status === "Closed")) {
    warnings.push(`Quick filter "Open" excludes "${f.status}" — clear one of them to see results.`);
  }

  // Assigned agent not in the chosen module
  if (f.assignedAgent && f.assignedAgent !== "all" && f.module && f.module !== "all") {
    const exists = defects.some(
      (d) => d.assignedAgent === f.assignedAgent && d.module === f.module,
    );
    if (!exists) {
      warnings.push(
        `${f.assignedAgent} is not assigned to any "${f.module}" defects. Try a different module or agent.`,
      );
    }
  }

  return warnings;
}

export function buildEmptyResultMessage(filters: FilterState, warnings: string[]): string {
  if (warnings.length) return warnings.join(" ");
  const active = Object.entries(filters)
    .filter(([, v]) => v && v !== "all" && v !== "")
    .map(([k]) => k);
  if (!active.length) return "No defects available yet.";
  return `No defects match these filters: ${active.join(", ")}. Try resetting one or more filters.`;
}
