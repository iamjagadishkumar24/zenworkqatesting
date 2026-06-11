import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AdminPrefs = {
  // Configurable enums
  defectStatuses: string[];
  errorStatuses: string[];
  priorities: string[];
  severities: string[];
  modules: string[];
  // Notifications
  notifyOnAssignEmail: boolean;
  notifyCriticalSlack: boolean;
  notifyWeeklyDigest: boolean;
  notifyOnReopen: boolean;
  notifyOnComment: boolean;
  // Reports
  reportTimezone: string;
  reportWeekStart: "monday" | "sunday";
  defaultExportFormat: "csv" | "xlsx";
  includeCommentsInExport: boolean;
  // Theme
  theme: "system" | "light" | "dark";
  accent: "blue" | "violet" | "emerald" | "rose";
  density: "comfortable" | "compact";
  // Dashboard
  defaultLanding: "/dashboard" | "/my-reported-errors" | "/my-errors";
  showKpiCards: boolean;
  showTrendChart: boolean;
  showAgentChart: boolean;
  // Import/export
  csvDelimiter: "," | ";" | "\t";
  importMergeStrategy: "skip-existing" | "overwrite";
};

const DEFAULTS: AdminPrefs = {
  defectStatuses: ["Reported","Pending","Ongoing","In Progress","Fixed","Retest Required","Reopened","Closed"],
  errorStatuses: ["Open","Triaging","Valid","Invalid","Duplicate","Resolved"],
  priorities: ["Low","Medium","High","Critical"],
  severities: ["Low","Medium","High","Critical"],
  modules: ["1099 Forms","990 Forms","Integrations","1099 Online"],
  notifyOnAssignEmail: true,
  notifyCriticalSlack: true,
  notifyWeeklyDigest: false,
  notifyOnReopen: true,
  notifyOnComment: false,
  reportTimezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
  reportWeekStart: "monday",
  defaultExportFormat: "xlsx",
  includeCommentsInExport: false,
  theme: "system",
  accent: "blue",
  density: "comfortable",
  defaultLanding: "/dashboard",
  showKpiCards: true,
  showTrendChart: true,
  showAgentChart: true,
  csvDelimiter: ",",
  importMergeStrategy: "skip-existing",
};

const BASE_KEY = "qa.admin.prefs.v1";

function userKey(uid: string | null): string {
  return uid ? `${BASE_KEY}:${uid}` : BASE_KEY;
}

function readFor(uid: string | null): AdminPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw =
      window.localStorage.getItem(userKey(uid)) ??
      window.localStorage.getItem(BASE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AdminPrefs>) };
  } catch {
    return DEFAULTS;
  }
}

export function usePrefs() {
  const [uid, setUid] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<AdminPrefs>(() => readFor(null));

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const id = data.session?.user.id ?? null;
      setUid(id);
      setPrefs(readFor(id));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const id = session?.user.id ?? null;
      setUid(id);
      setPrefs(readFor(id));
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(userKey(uid), JSON.stringify(prefs));
    // Apply theme
    const root = document.documentElement;
    const wantDark = prefs.theme === "dark" || (prefs.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", wantDark);
    root.dataset.accent = prefs.accent;
    root.dataset.density = prefs.density;
  }, [prefs, uid]);

  // Re-apply when system color scheme changes (for "system" mode)
  useEffect(() => {
    if (typeof window === "undefined" || prefs.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [prefs.theme]);

  const update = <K extends keyof AdminPrefs>(k: K, v: AdminPrefs[K]) =>
    setPrefs((p) => ({ ...p, [k]: v }));

  const reset = () => setPrefs(DEFAULTS);

  return { prefs, update, reset, setPrefs };
}

export const PREF_DEFAULTS = DEFAULTS;