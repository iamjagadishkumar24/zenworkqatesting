import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQA } from "@/lib/qa/store";
import { getMyPreferences, saveMyPreferences } from "@/lib/qa/userPreferences.functions";
import { toast } from "sonner";

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
  accent:
    | "blue"
    | "violet"
    | "emerald"
    | "rose"
    | "light"
    | "green"
    | "purple"
    | "orange"
    | "pink"
    | "grey"
    | "teal";
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

// Single source of truth for which accent values the backend will accept.
// Kept in sync with the zod enum in userPreferences.functions.ts.
export const ALLOWED_ACCENTS: AdminPrefs["accent"][] = [
  "blue", "violet", "emerald", "rose",
  "light", "green", "purple", "orange", "pink", "grey", "teal",
];
export const ALLOWED_THEMES: AdminPrefs["theme"][] = ["system", "light", "dark"];

const DEFAULTS: AdminPrefs = {
  defectStatuses: [
    "Reported",
    "Pending",
    "Ongoing",
    "In Progress",
    "Fixed",
    "Retest Required",
    "Reopened",
    "Closed",
  ],
  errorStatuses: ["Open", "Triaging", "Valid", "Invalid", "Duplicate", "Resolved"],
  priorities: ["Low", "Medium", "High", "Critical"],
  severities: ["Low", "Medium", "High", "Critical"],
  modules: ["1099 Forms", "990 Forms", "Integrations", "1099 Online"],
  notifyOnAssignEmail: true,
  notifyCriticalSlack: true,
  notifyWeeklyDigest: false,
  notifyOnReopen: true,
  notifyOnComment: false,
  reportTimezone:
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
  reportWeekStart: "monday",
  defaultExportFormat: "xlsx",
  includeCommentsInExport: false,
  theme: "light",
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
    const raw = window.localStorage.getItem(userKey(uid)) ?? window.localStorage.getItem(BASE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AdminPrefs>) };
  } catch {
    return DEFAULTS;
  }
}

export function usePrefs() {
  const { currentUser } = useQA();
  const isAdmin = currentUser?.role === "admin";
  const [uid, setUid] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<AdminPrefs>(() => readFor(null));

  useEffect(() => {
    let alive = true;
    const hydrate = async (id: string | null) => {
      // Local cache first for instant paint.
      if (alive) setPrefs(readFor(id));
      if (!id) return;
      // Then merge backend truth so prefs persist across devices/clears.
      try {
        const remote = await getMyPreferences();
        if (!alive || !remote) return;
        setPrefs((p) => ({ ...p, ...(remote as Partial<AdminPrefs>) }));
      } catch {
        /* offline / unauthenticated — fall back to local cache */
      }
    };
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const id = data.session?.user.id ?? null;
      setUid(id);
      void hydrate(id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const id = session?.user.id ?? null;
      setUid(id);
      void hydrate(id);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(userKey(uid), JSON.stringify(prefs));
    // Apply theme. Default is Light; "system" falls back to Light so new
    // users always start on the light theme until they explicitly switch.
    // Dark mode is an Admin-only capability — non-admins (agents) are
    // pinned to light regardless of any persisted preference.
    const root = document.documentElement;
    const wantDark = isAdmin && prefs.theme === "dark";
    root.classList.toggle("dark", wantDark);
    // Admins are pinned to the default "blue" accent — agent color themes
    // must never apply to admin sessions even if forced via localStorage
    // or query string.
    const AGENT_ONLY: AdminPrefs["accent"][] = [
      "light", "green", "purple", "orange", "pink", "grey", "teal",
    ];
    const accent =
      isAdmin && AGENT_ONLY.includes(prefs.accent) ? "blue" : prefs.accent;
    root.dataset.accent = accent;
    root.dataset.density = prefs.density;
  }, [prefs, uid, isAdmin]);

  const update = <K extends keyof AdminPrefs>(k: K, v: AdminPrefs[K]) =>
    setPrefs((p) => {
      const next = { ...p, [k]: v };
      // Best-effort backend sync; localStorage write happens in the apply effect.
      if (uid) {
        void saveMyPreferences({
          data: {
            theme: next.theme,
            accent: next.accent,
            density: next.density,
            default_landing: next.defaultLanding,
            show_kpi_cards: next.showKpiCards,
            show_trend_chart: next.showTrendChart,
            show_agent_chart: next.showAgentChart,
          },
        }).catch(() => {});
      }
      return next;
    });

  const reset = () => setPrefs(DEFAULTS);

  return { prefs, update, reset, setPrefs };
}

export const PREF_DEFAULTS = DEFAULTS;
