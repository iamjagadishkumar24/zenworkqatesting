import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Capture ReportDefectDialog invocations to verify open state + linkage props.
const dialogCalls: Array<Record<string, unknown>> = [];
vi.mock("@/components/qa/ReportDefectDialog", () => ({
  ReportDefectDialog: (props: Record<string, unknown>) => {
    dialogCalls.push(props);
    return props.open ? <div data-testid="report-defect-dialog" /> : null;
  },
}));
vi.mock("@/components/qa/DefectDetailSheet", () => ({ DefectDetailSheet: () => null }));
vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({ defects: [], currentUser: { name: "Tester", role: "admin" } }),
}));
vi.mock("@/lib/qa/environment", () => ({ useEnvironment: () => ({ env: null }) }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (cfg: unknown) => cfg }));

import type { ReactElement } from "react";
import { Route } from "./_app.functionality-testing";

const Page = (Route as unknown as { component: () => ReactElement }).component;

function renderAt(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
  dialogCalls.length = 0;
  return render(<Page />);
}

describe("Functionality Testing page", () => {
  it.each([
    ["desktop", 1280],
    ["mobile", 375],
  ])("on %s: no standalone 'Report defect' header button is rendered", (_l, w) => {
    renderAt(w);
    // The header button label is "Report defect" (lowercase d); per-card uses "Report Error".
    expect(screen.queryByRole("button", { name: /^report defect$/i })).toBeNull();
    // Sanity: per-feature actions still exist.
    expect(screen.getAllByRole("button", { name: /report error/i }).length).toBeGreaterThan(0);
  });

  it("opens ReportDefectDialog only from a per-feature Report Error, with correct module/category/feature linkage", () => {
    renderAt(1280);

    // Before any click, dialog must not be open.
    expect(screen.queryByTestId("report-defect-dialog")).toBeNull();
    expect(dialogCalls.every((p) => p.open === false)).toBe(true);

    // Switch to the Payer category and click the first feature's "Report Error".
    fireEvent.click(screen.getByRole("tab", { name: "Payer" }));
    const firstFeature = screen.getAllByRole("button", { name: /report error/i })[0];
    fireEvent.click(firstFeature);

    // Dialog now rendered open.
    expect(screen.getByTestId("report-defect-dialog")).toBeInTheDocument();

    const last = dialogCalls.at(-1)!;
    expect(last.open).toBe(true);
    // Module is the DB-stored "Functionality Testing".
    expect(last.defaultModule).toBe("Functionality Testing");
    // The defaultForm encodes "Category · Feature" — Category prefix proves linkage.
    expect(String(last.defaultForm)).toMatch(/^Payer · /);
    expect(String(last.defaultForm).length).toBeGreaterThan("Payer · ".length);
  });
});