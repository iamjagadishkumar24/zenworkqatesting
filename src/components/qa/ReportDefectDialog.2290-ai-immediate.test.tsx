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
import { FORMS_2290 } from "@/lib/qa/constants";

const CATEGORY_TESTID = "form-2290-ai-category";

function open2290Form(form: string) {
  return render(
    <ReportDefectDialog
      open={true}
      onOpenChange={() => {}}
      defaultModule={"2290 Forms" as never}
      defaultForm={form}
      formOptions={FORMS_2290 as unknown as string[]}
    />,
  );
}

describe("Report Defect — 2290.ai categories appear immediately", () => {
  it("renders the 2290.ai Issue Category section as soon as the dialog opens with 2290.ai", () => {
    open2290Form("2290.ai");
    const section = screen.getByTestId(CATEGORY_TESTID);
    expect(section).toBeInTheDocument();

    // Open the select and verify all three landing-page categories are listed.
    const trigger = within(section).getByRole("combobox");
    fireEvent.click(trigger);
    for (const c of FORM_2290_AI_CATEGORIES) {
      expect(screen.getAllByText(c).length).toBeGreaterThan(0);
    }
  });

  it("places the Issue Category before downstream fields (title, attachments, schedules)", () => {
    open2290Form("2290.ai");
    const section = screen.getByTestId(CATEGORY_TESTID);
    const titleLabel = screen.getByText(/^Title \*/i);
    expect(
      section.compareDocumentPosition(titleLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("hides the Issue Category section for every other 2290 form type", () => {
    for (const form of FORMS_2290.filter((f) => f !== "2290.ai")) {
      const { unmount } = open2290Form(form);
      expect(screen.queryByTestId(CATEGORY_TESTID)).toBeNull();
      unmount();
    }
  });
});