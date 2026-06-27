import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
type ReportViewsFilters = Database["public"]["Tables"]["report_views"]["Insert"]["filters"];

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

const LEGACY_KEY = "qa.reports.savedViews.v1";

async function migrateLegacy(userId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw) as SavedView[];
    if (!Array.isArray(legacy) || legacy.length === 0) {
      window.localStorage.removeItem(LEGACY_KEY);
      return;
    }
    await supabase.from("report_views").upsert(
      legacy.map((v) => ({
        user_id: userId,
        name: v.name,
        filters: v.filters as unknown as Record<string, unknown>,
      })),
      { onConflict: "user_id,name" },
    );
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("report_views")
      .select("name, filters")
      .eq("user_id", uid)
      .order("name", { ascending: true });
    if (error || !data) return;
    setViews(
      data.map((r) => ({
        name: r.name,
        filters: r.filters as unknown as ReportFilters,
      })),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (uid) {
        await migrateLegacy(uid);
        await refresh(uid);
      } else {
        setViews([]);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid) refresh(uid);
      else setViews([]);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`report_views:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "report_views", filter: `user_id=eq.${userId}` },
        () => refresh(userId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return {
    views,
    save: async (name: string, filters: ReportFilters) => {
      const trimmed = name.trim();
      if (!trimmed || !userId) return;
      const next = [...views.filter((v) => v.name !== trimmed), { name: trimmed, filters }];
      setViews(next);
      await supabase
        .from("report_views")
        .upsert(
          {
            user_id: userId,
            name: trimmed,
            filters: filters as unknown as Record<string, unknown>,
          },
          { onConflict: "user_id,name" },
        );
    },
    remove: async (name: string) => {
      if (!userId) return;
      setViews((vs) => vs.filter((v) => v.name !== name));
      await supabase.from("report_views").delete().eq("user_id", userId).eq("name", name);
    },
  };
}
