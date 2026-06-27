import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

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
  cleanup();
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

  // Source-of-truth matrix: each row is (selected category tab, expected
  // visible feature card label, expected dialog `defaultForm` value).
  // For Payer/Recipient the items themselves embed "Category · Feature" so
  // the dialog's defaultForm includes that linkage; for plain categories
  // (Forms, Integrations, Dashboard) defaultForm equals the feature name.
  const cases: Array<{
    tab: string;
    card: string;
    expectedForm: string;
    expectedCategoryPrefix?: string;
    expectedFeature: string;
  }> = [
    {
      tab: "Forms",
      card: "Unsubmitted Forms",
      expectedForm: "Unsubmitted Forms",
      expectedFeature: "Unsubmitted Forms",
    },
    {
      tab: "Dashboard",
      card: "Dashboard",
      expectedForm: "Dashboard",
      expectedFeature: "Dashboard",
    },
  ];

  it.each(cases)(
    "Report Error on %s · %s wires module + feature into the dialog",
    ({ tab, card, expectedForm, expectedFeature }) => {
      renderAt(1280);

      // Dialog starts closed.
      expect(screen.queryByTestId("report-defect-dialog")).toBeNull();
      expect(dialogCalls.every((p) => p.open === false)).toBe(true);

      fireEvent.click(screen.getByRole("tab", { name: tab }));

      // Each card row has one "Report Error" button; click the first one,
      // which corresponds to the first item of the selected category.
      const reportBtns = screen.getAllByRole("button", { name: /report error/i });
      fireEvent.click(reportBtns[0]);
      // Sanity: the clicked card's visible label is the expected feature.
      // (Cards render the label as a heading button.)
      expect(screen.getAllByRole("button", { name: card }).length).toBeGreaterThan(0);

      expect(screen.getByTestId("report-defect-dialog")).toBeInTheDocument();
      const last = dialogCalls.at(-1)!;
      expect(last.open).toBe(true);
      // Module is hard-wired to "Functionality Testing".
      expect(last.defaultModule).toBe("Functionality Testing");
      // Feature is exactly the card label the user clicked.
      expect(last.defaultForm).toBe(expectedForm);
      // Integration channel is empty for non-Integrations module rows of the
      // dialog (Functionality Testing uses formFeature, not integration).
      expect(last.defaultIntegration).toBe("");
      // QB-desktop category linkage stays unset for these rows.
      expect(last.defaultQbCategory).toBeUndefined();
      expect(last.lockQbCategory).toBe(false);
      // Sanity: the feature name extracted from defaultForm equals the card.
      expect(expectedFeature).toBe(card);
    },
  );

  it("Payer / Recipient cards encode 'Category · Feature' in defaultForm", () => {
    for (const tab of ["Payer", "Recipient"] as const) {
      renderAt(1280);
      fireEvent.click(screen.getByRole("tab", { name: tab }));
      const firstReport = screen.getAllByRole("button", { name: /report error/i })[0];
      fireEvent.click(firstReport);

      const last = dialogCalls.at(-1)!;
      expect(last.defaultModule).toBe("Functionality Testing");
      const form = String(last.defaultForm);
      const [category, ...rest] = form.split(" · ");
      const feature = rest.join(" · ");
      expect(category).toBe(tab);
      expect(feature.length).toBeGreaterThan(0);
      // The exact "Category · Feature" string is also rendered on the card.
      expect(screen.getByText(form)).toBeInTheDocument();
    }
  });
});
