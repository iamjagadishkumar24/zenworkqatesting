import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestStatusBadge, DefectStatusBadge, PriorityBadge } from "./StatusBadge";

describe("StatusBadge family", () => {
  it("maps TestStatus values to user-facing labels", () => {
    const { rerender } = render(<TestStatusBadge status="Passed" />);
    expect(screen.getByText("Valid")).toBeInTheDocument();
    rerender(<TestStatusBadge status="Failed" />);
    expect(screen.getByText("Invalid Errors")).toBeInTheDocument();
    rerender(<TestStatusBadge status="Open Bug" />);
    expect(screen.getByText("Open Errors")).toBeInTheDocument();
    rerender(<TestStatusBadge status="Retest Required" />);
    expect(screen.getByText("Retest Required")).toBeInTheDocument();
  });

  it("renders DefectStatusBadge with the raw status text and themed class", () => {
    render(<DefectStatusBadge status="Retest Failed" />);
    const el = screen.getByText("Retest Failed");
    expect(el.className).toMatch(/destructive/);
  });

  it("applies priority colour classes", () => {
    const { rerender } = render(<PriorityBadge value="Critical" />);
    expect(screen.getByText("Critical").className).toMatch(/destructive/);
    rerender(<PriorityBadge value="Low" />);
    expect(screen.getByText("Low").className).toMatch(/muted/);
  });
});