import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQA } from "@/lib/qa/store";
import { getMyPreferences, saveMyPreferences } from "@/lib/qa/userPreferences.functions";
import { toast } from "sonner";
import { defaultTimeZone, isValidTimeZone } from "@/lib/qa/timezones";

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
  "blue",
  "violet",
  "emerald",
  "rose",
  "light",
  "green",
  "purple",
  "orange",
  "pink",
  "grey",
  "teal",
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
    // Apply theme. Available to all roles via the header toggle.
    // "system" follows the OS preference; "light"/"dark" are explicit.
    const root = document.documentElement;
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const wantDark = prefs.theme === "dark" || (prefs.theme === "system" && prefersDark);
    root.classList.toggle("dark", wantDark);
    // Admins are pinned to the default "blue" accent — agent color themes
    // must never apply to admin sessions even if forced via localStorage
    // or query string.
    const AGENT_ONLY: AdminPrefs["accent"][] = [
      "light",
      "green",
      "purple",
      "orange",
      "pink",
      "grey",
      "teal",
    ];
    const accent = isAdmin && AGENT_ONLY.includes(prefs.accent) ? "blue" : prefs.accent;
    root.dataset.accent = accent;
    root.dataset.density = prefs.density;
  }, [prefs, uid, isAdmin]);

  // When theme === "system", keep in sync with OS-level changes.
  useEffect(() => {
    if (typeof window === "undefined" || prefs.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches);
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [prefs.theme]);

  const update = <K extends keyof AdminPrefs>(k: K, v: AdminPrefs[K]) =>
    setPrefs((p) => {
      const next = { ...p, [k]: v };
      // Frontend validation: reject unsupported theme/accent values up front
      // so a crafted UI can't ask the backend to persist garbage. The toast
      // mirrors the error the server would have returned.
      if (k === "accent" && !ALLOWED_ACCENTS.includes(v as AdminPrefs["accent"])) {
        toast.error(`Unsupported theme color: ${String(v)}`);
        return p;
      }
      if (k === "theme" && !ALLOWED_THEMES.includes(v as AdminPrefs["theme"])) {
        toast.error(`Unsupported theme mode: ${String(v)}`);
        return p;
      }
      // Best-effort backend sync; localStorage write happens in the apply effect.
      if (uid) {
        const isAccentChange = k === "accent";
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
        })
          .then(() => {
            if (isAccentChange) {
              toast.success("Theme synced", {
                description:
                  "Your accent color was saved. If it doesn't appear everywhere, refresh the page.",
              });
            }
          })
          .catch((err: unknown) => {
            // Surface the server's response so the user sees why their
            // selection didn't persist (e.g. unsupported value, RLS denial).
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Couldn't save theme: ${msg}`, {
              description: "Try refreshing the page and selecting the color again.",
            });
          });
      }
      return next;
    });

  const reset = () => setPrefs(DEFAULTS);

  return { prefs, update, reset, setPrefs };
}

export const PREF_DEFAULTS = DEFAULTS;

/** Hook returning the user's preferred IANA time zone with safe fallbacks. */
export function useUserTimeZone(): string {
  const { prefs } = usePrefs();
  const tz = prefs.reportTimezone;
  return isValidTimeZone(tz) ? tz : defaultTimeZone();
}
