import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Polyfills Radix Select needs in jsdom.
if (!(window as unknown as { PointerEvent?: unknown }).PointerEvent) {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class extends MouseEvent {} as unknown as typeof MouseEvent;
}
Object.assign(window.HTMLElement.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
  scrollIntoView: () => {},
});

const addDefect = vi.fn(async (_: unknown) => ({ ok: true as const }));

vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({
    addDefect,
    currentUser: { name: "Tester", role: "admin" },
  }),
}));
vi.mock("@/lib/qa/environment", () => ({ useEnvironment: () => ({ env: "Production" }) }));

import { ReportDefectDialog } from "./ReportDefectDialog";
import { FORMS_2290 } from "@/lib/qa/constants";
import { defectIssueCategory, FORM_2290_AI_CATEGORIES } from "@/lib/qa/adminFilters";

function renderDialog() {
  return render(
    <ReportDefectDialog
      open={true}
      onOpenChange={() => {}}
      defaultModule={"2290 Forms" as never}
      defaultForm="2290.ai"
      formOptions={FORMS_2290 as unknown as string[]}
    />,
  );
}

describe("Report Defect — 2290.ai category persistence and re-display", () => {
  it.each(FORM_2290_AI_CATEGORIES)(
    "saves '%s' on the defect and re-surfaces it via defectIssueCategory",
    async (category) => {
      addDefect.mockClear();
      renderDialog();

      // Pick the 2290.ai issue category via Radix Select.
      const user = userEvent.setup();
      const section = screen.getByTestId("form-2290-ai-category");
      await user.click(within(section).getByRole("combobox"));
      await user.click(await screen.findByRole("option", { name: category }));

      // Required fields. Labels aren't htmlFor-linked, so reach the input via
      // the label's parent <div>.
      const inputAfter = (labelText: RegExp) => {
        const label = screen.getByText(labelText);
        const field = label.parentElement!.querySelector("input,textarea");
        if (!field) throw new Error(`No input/textarea after label ${labelText}`);
        return field as HTMLInputElement | HTMLTextAreaElement;
      };
      fireEvent.change(inputAfter(/Error Title \*/i), {
        target: { value: "Sample 2290.ai issue" },
      });
      fireEvent.change(inputAfter(/Description \/ Comments \*/i), {
        target: { value: "Repro steps captured." },
      });

      fireEvent.click(screen.getByRole("button", { name: /create error/i }));

      await waitFor(() => expect(addDefect).toHaveBeenCalledTimes(1));
      const payload = addDefect.mock.calls[0][0] as { schedules?: string[] };
      expect(payload.schedules).toEqual([category]);

      // Re-opening / editing the same record reads the category back.
      expect(defectIssueCategory({ schedules: payload.schedules })).toBe(category);
    },
  );
});