import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { US_STATES, isValidUsState } from "@/lib/qa/constants";
import { useQA } from "@/lib/qa/store";
import { useMemo, type ReactNode } from "react";

export type SubPageSearch = {
  state: string;
  errorType: string;
  dateRange: string;
};

export const DEFAULT_SUB_SEARCH: SubPageSearch = {
  state: "all",
  errorType: "all",
  dateRange: "30d",
};

export function validateSubSearch(input: Record<string, unknown>): SubPageSearch {
  const str = (k: keyof SubPageSearch) =>
    typeof input[k] === "string" ? (input[k] as string) : DEFAULT_SUB_SEARCH[k];
  const rawState = str("state");
  return {
    state: rawState === "all" || isValidUsState(rawState) ? rawState : "all",
    errorType: str("errorType"),
    dateRange: str("dateRange"),
  };
}

/**
 * Shared layout for every Reports sub-page (Performance, User, Activity,
 * Analytics, Audit, Scheduled, Export Center). Provides:
 *  - Title, description and right-hand action slot.
 *  - State + error-type + date filters with URL-friendly callbacks so each
 *    page can sync to `Route.useSearch`.
 *  - Drill-down hint linking back into the main Error Reports view with the
 *    same state filter applied.
 */
export function ReportsSubPageShell({
  title,
  description,
  search,
  onChange,
  errorTypes,
  actions,
  children,
}: {
  title: string;
  description: string;
  search: SubPageSearch;
  onChange: (patch: Partial<SubPageSearch>) => void;
  /** Distinct error/module categories drawn from the store; rendered in the dropdown. */
  errorTypes?: string[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { defects } = useQA();
  const distinctTypes = useMemo(
    () => errorTypes ?? Array.from(new Set(defects.map((d) => d.module).filter(Boolean))).sort(),
    [defects, errorTypes],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">{actions}</div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>U.S. State</Label>
            <Select
              value={search.state}
              onValueChange={(v) =>
                onChange({ state: v === "all" || isValidUsState(v) ? v : "all" })
              }
            >
              <SelectTrigger className="h-9" aria-label="Filter by U.S. state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All states</SelectItem>
                {US_STATES.map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Error Type</Label>
            <Select
              value={search.errorType}
              onValueChange={(v) => onChange({ errorType: v })}
            >
              <SelectTrigger className="h-9" aria-label="Filter by error type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All error types</SelectItem>
                {distinctTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date Range</Label>
            <Select
              value={search.dateRange}
              onValueChange={(v) => onChange({ dateRange: v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link
                to="/reports"
                search={{
                  status: "all",
                  testingType: "all",
                  category: search.errorType === "all" ? "all" : search.errorType,
                  agent: "all",
                  dateRange: search.dateRange === "all" ? "all" : search.dateRange,
                  fromDate: "",
                  toDate: "",
                  state: search.state,
                }}
              >
                Drill into Error Reports →
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {children}
    </div>
  );
}

/**
 * Reusable filter that returns the defects matching the shared sub-page
 * search, plus a date lower-bound the caller can re-use for finer charts.
 */
export function useFilteredSubPageDefects(search: SubPageSearch) {
  const { defects } = useQA();
  return useMemo(() => {
    const now = Date.now();
    const windowDays =
      search.dateRange === "7d"
        ? 7
        : search.dateRange === "30d"
          ? 30
          : search.dateRange === "90d"
            ? 90
            : null;
    const from = windowDays ? now - windowDays * 86_400_000 : null;
    return defects.filter((d) => {
      if (search.state !== "all" && (d.state ?? "") !== search.state) return false;
      if (search.errorType !== "all" && d.module !== search.errorType) return false;
      if (from && new Date(d.createdAt).getTime() < from) return false;
      return true;
    });
  }, [defects, search]);
}