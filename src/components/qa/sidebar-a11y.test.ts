import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source-level a11y contract for the collapsible sidebar in AppShell.tsx.
 * These attributes are required for keyboard + screen-reader users and any
 * removal would silently regress accessibility, so we pin them here.
 */
const src = readFileSync(resolve(__dirname, "AppShell.tsx"), "utf8");

describe("AppShell sidebar accessibility contract", () => {
  it("the <aside> exposes a navigation landmark label and a collapsed state", () => {
    expect(src).toMatch(/<aside\b[^>]*aria-label="Primary"/);
    expect(src).toMatch(/data-collapsed=\{collapsed \? "true" : "false"\}/);
  });

  it("the inner <nav> is labelled and addressable via aria-controls", () => {
    expect(src).toMatch(/<nav id="primary-nav" aria-label="Main navigation"/);
  });

  it("the toggle button announces expand/collapse state to assistive tech", () => {
    expect(src).toContain(
      `aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}`,
    );
    expect(src).toContain("aria-expanded={!collapsed}");
    expect(src).toContain('aria-controls="primary-nav"');
  });

  it("every active link variant sets aria-current=\"page\"", () => {
    // Count of aria-current occurrences — one per Link branch we render:
    // single-item-group collapsed, single-item-group expanded, group child
    // collapsed, group child expanded, top-level item.
    const matches = src.match(/aria-current=\{active \? "page" : undefined\}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  it("collapsed top-level items expose a text alternative via aria-label/title", () => {
    expect(src).toContain("aria-label={collapsed ? item.label : undefined}");
    expect(src).toContain("title={collapsed ? item.label : undefined}");
  });

  it("expandable group headers expose aria-expanded + aria-controls", () => {
    expect(src).toMatch(/aria-expanded=\{open\}/);
    expect(src).toMatch(/aria-controls=\{`nav-group-\$\{entry\.id\}`\}/);
  });
});