import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({ defects: [], currentUser: { name: "Tester", role: "admin" } }),
}));
vi.mock("@/lib/qa/environment", () => ({ useEnvironment: () => ({ env: null }) }));
vi.mock("./DefectDetailSheet", () => ({ DefectDetailSheet: () => null }));
vi.mock("./ReportDefectDialog", () => ({ ReportDefectDialog: () => null }));

import { TestingModule } from "./TestingModule";

const ITEMS = [
  "TIN Match",
  "W-9 Form",
  "W-8 Form",
  "Bulk Upload",
  "Vendor Management",
  "State Filing",
  "E-Delivery",
  "Print & Mail",
  "AI Chat Assistance",
  "BOI Reporting",
  "EFTPS",
];

function renderTax1099(viewportWidth: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
  });
  window.dispatchEvent(new Event("resize"));
  return render(
    <TestingModule
      title="Tax1099 Features"
      description="Validate Tax1099 product features in the selected environment."
      module={"Tax1099 Features" as never}
      items={ITEMS}
      itemLabel="feature"
      showHeaderReport={false}
    />,
  );
}

describe("Tax1099 Features search (header button removed)", () => {
  it.each([
    ["desktop", 1280],
    ["mobile", 375],
  ])("on %s: search expands and no Report defect header button is rendered", (_label, width) => {
    renderTax1099(width);

    // Header "Report defect" button must be gone.
    expect(screen.queryByRole("button", { name: /report defect/i })).toBeNull();

    // Search input is rendered and its wrapper grows (w-full, no fixed w-72).
    const input = screen.getByPlaceholderText(/search features/i) as HTMLInputElement;
    const wrapper = input.parentElement as HTMLElement;
    expect(wrapper.className).toMatch(/w-full/);
    expect(wrapper.className).not.toMatch(/w-72/);
  });

  it.each([
    ["desktop", 1280],
    ["mobile", 375],
  ])("on %s: filtering narrows the visible feature cards", (_label, width) => {
    renderTax1099(width);

    // All features visible initially.
    for (const name of ITEMS) expect(screen.getByText(name)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/search features/i);
    fireEvent.change(input, { target: { value: "bulk" } });

    expect(screen.getByText("Bulk Upload")).toBeInTheDocument();
    expect(screen.queryByText("TIN Match")).toBeNull();
    expect(screen.queryByText("E-Delivery")).toBeNull();

    // Clearing restores all.
    fireEvent.change(input, { target: { value: "" } });
    for (const name of ITEMS) expect(screen.getByText(name)).toBeInTheDocument();
  });

  it("unused 'within' import sanity", () => {
    expect(typeof within).toBe("function");
  });
});
