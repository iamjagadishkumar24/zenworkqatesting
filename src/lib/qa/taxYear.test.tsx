import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { TaxYearProvider, useTaxYear, matchesTaxYear } from "./taxYear";
import { TAX_YEARS } from "./constants";

describe("matchesTaxYear", () => {
  it("returns true for any row when filter is 'all'", () => {
    expect(matchesTaxYear("2025", "all")).toBe(true);
    expect(matchesTaxYear(null, "all")).toBe(true);
    expect(matchesTaxYear(undefined, "all")).toBe(true);
    expect(matchesTaxYear("", "all")).toBe(true);
  });

  it("requires exact match when a specific year is selected", () => {
    const y = TAX_YEARS[0];
    expect(matchesTaxYear(y, y)).toBe(true);
    expect(matchesTaxYear("1999", y)).toBe(false);
    expect(matchesTaxYear(null, y)).toBe(false);
    expect(matchesTaxYear(undefined, y)).toBe(false);
  });
});

describe("TaxYearProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function wrap({ children }: { children: React.ReactNode }) {
    return <TaxYearProvider>{children}</TaxYearProvider>;
  }

  it("throws when useTaxYear is used outside the provider", () => {
    const orig = console.error;
    console.error = () => undefined;
    try {
      expect(() => renderHook(() => useTaxYear())).toThrow(/TaxYearProvider/);
    } finally {
      console.error = orig;
    }
  });

  it("defaults to 'all' when localStorage is empty", () => {
    const { result } = renderHook(() => useTaxYear(), { wrapper: wrap });
    expect(result.current.taxYear).toBe("all");
  });

  it("hydrates from localStorage when a valid year is stored", () => {
    window.localStorage.setItem("zenwork.taxYear", TAX_YEARS[0]);
    const { result } = renderHook(() => useTaxYear(), { wrapper: wrap });
    expect(result.current.taxYear).toBe(TAX_YEARS[0]);
  });

  it("ignores invalid stored values and falls back to 'all'", () => {
    window.localStorage.setItem("zenwork.taxYear", "not-a-year");
    const { result } = renderHook(() => useTaxYear(), { wrapper: wrap });
    expect(result.current.taxYear).toBe("all");
  });

  it("persists changes to localStorage and updates state", () => {
    const { result } = renderHook(() => useTaxYear(), { wrapper: wrap });
    act(() => result.current.setTaxYear(TAX_YEARS[0]));
    expect(result.current.taxYear).toBe(TAX_YEARS[0]);
    expect(window.localStorage.getItem("zenwork.taxYear")).toBe(TAX_YEARS[0]);
    act(() => result.current.setTaxYear("all"));
    expect(window.localStorage.getItem("zenwork.taxYear")).toBe("all");
  });

  it("syncs from cross-tab storage events", () => {
    const { result } = renderHook(() => useTaxYear(), { wrapper: wrap });
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "zenwork.taxYear", newValue: TAX_YEARS[0] }),
      );
    });
    expect(result.current.taxYear).toBe(TAX_YEARS[0]);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "zenwork.taxYear", newValue: null }));
    });
    expect(result.current.taxYear).toBe("all");
  });

  it("ignores unrelated storage keys", () => {
    const { result } = renderHook(() => useTaxYear(), { wrapper: wrap });
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: "x" }));
    });
    expect(result.current.taxYear).toBe("all");
  });
});
