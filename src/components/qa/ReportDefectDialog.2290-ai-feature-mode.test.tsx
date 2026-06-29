import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({
    addDefect: vi.fn(),
    currentUser: { name: "Tester", role: "admin" },
  }),
}));
vi.mock("@/lib/qa/environment", () => ({ useEnvironment: () => ({ env: "Production" }) }));

import { ReportDefectDialog, FORM_2290_AI_CATEGORIES } from "./ReportDefectDialog";

const CATEGORY_TESTID = "form-2290-ai-category";

// The 2290 Forms module opens the Report dialog with featureMode=true and the
// selected form pre-locked as a Feature. The three 2290.ai reporting
// categories must still render immediately in that entry point.
describe("Report Defect — 2290.ai categories in featureMode", () => {
  it("renders the three categories immediately when opened with featureMode=true and 2290.ai", () => {
    render(
      <ReportDefectDialog
        open={true}
        onOpenChange={() => {}}
        defaultModule={"2290 Forms" as never}
        defaultForm="2290.ai"
        featureMode
      />,
    );

    const section = screen.getByTestId(CATEGORY_TESTID);
    expect(section).toBeInTheDocument();

    // The form is locked as a read-only Feature input (no form dropdown).
    expect(screen.getByDisplayValue("2290.ai")).toHaveAttribute("readonly");

    const trigger = within(section).getByRole("combobox");
    fireEvent.click(trigger);
    for (const c of FORM_2290_AI_CATEGORIES) {
      expect(screen.getAllByText(c).length).toBeGreaterThan(0);
    }
  });
});