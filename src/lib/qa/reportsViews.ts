import { useEffect, useState } from "react";

export type ReportFilters = {
  status: string;
  testingType: string;
  category: string;
  agent: string;
  dateRange: string;
  fromDate: string;
  toDate: string;
};

export type SavedView = { name: string; filters: ReportFilters };

const KEY = "qa.reports.savedViews.v1";

function read(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setViews(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = (next: SavedView[]) => {
    setViews(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* quota */
    }
  };

  return {
    views,
    save: (name: string, filters: ReportFilters) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const without = views.filter((v) => v.name !== trimmed);
      persist([...without, { name: trimmed, filters }]);
    },
    remove: (name: string) => persist(views.filter((v) => v.name !== name)),
  };
}