import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { TAX_YEARS, type TaxYear } from "./constants";

const KEY = "zenwork.taxYear";

/** "all" means no tax year filter; otherwise one of TAX_YEARS. */
export type TaxYearFilter = "all" | TaxYear;

function readStored(): TaxYearFilter {
  if (typeof window === "undefined") return "all";
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "all") return "all";
    if (v && (TAX_YEARS as readonly string[]).includes(v)) return v as TaxYear;
  } catch {
    /* ignore */
  }
  return "all";
}

type Ctx = {
  taxYear: TaxYearFilter;
  setTaxYear: (v: TaxYearFilter) => void;
};

const TaxYearCtx = createContext<Ctx | null>(null);

export function TaxYearProvider({ children }: { children: ReactNode }) {
  const [taxYear, setState] = useState<TaxYearFilter>(() => readStored());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      if (e.newValue === "all" || e.newValue === null) setState("all");
      else if ((TAX_YEARS as readonly string[]).includes(e.newValue))
        setState(e.newValue as TaxYear);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTaxYear = useCallback((v: TaxYearFilter) => {
    setState(v);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
  }, []);

  return <TaxYearCtx.Provider value={{ taxYear, setTaxYear }}>{children}</TaxYearCtx.Provider>;
}

export function useTaxYear() {
  const c = useContext(TaxYearCtx);
  if (!c) throw new Error("useTaxYear must be used within TaxYearProvider");
  return c;
}

/** True when the defect/task's tax_year passes the current filter. */
export function matchesTaxYear(rowYear: string | null | undefined, filter: TaxYearFilter): boolean {
  if (filter === "all") return true;
  return (rowYear ?? "") === filter;
}
