import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/assets/zenwork-logo.png.asset.json", () => ({
  default: { url: "https://cdn/test-logo.png" },
}));

import { BrandLogo } from "./BrandLogo";
import { RealtimeStatus } from "./RealtimeStatus";

describe("BrandLogo", () => {
  it("renders an accessible logo image from the asset URL", () => {
    render(<BrandLogo />);
    const img = screen.getByAltText(/zenwork logo/i) as HTMLImageElement;
    expect(img.src).toContain("test-logo.png");
    expect(img).toHaveAttribute("draggable", "false");
  });

  it("respects custom className and alt text", () => {
    const { container } = render(<BrandLogo className="custom-x" alt="Custom alt" />);
    expect(screen.getByAltText("Custom alt")).toBeInTheDocument();
    expect(container.querySelector("img")?.className).toMatch(/custom-x/);
  });
});

describe("RealtimeStatus (no-op)", () => {
  it("renders nothing — kept as a no-op placeholder", () => {
    const { container } = render(<RealtimeStatus />);
    expect(container.firstChild).toBeNull();
  });
});
