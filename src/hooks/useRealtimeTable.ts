import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared Supabase Realtime subscription that invalidates a TanStack Query
 * key whenever a row matching `filter` changes. RLS is enforced by Supabase
 * — subscribers only ever receive rows they are allowed to SELECT, so this
 * hook is safe to use on user-scoped tables.
 *
 * Always called inside a component; cleanup runs on unmount to avoid the
 * "channel leak per render" anti-pattern.
 */
export function useRealtimeTable(opts: {
  table: string;
  queryKey: QueryKey;
  /** PostgREST filter, e.g. `user_id=eq.${uid}`. */
  filter?: string;
  /** INSERT / UPDATE / DELETE / *  (default: `*`). */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  enabled?: boolean;
}) {
  const qc = useQueryClient();
  const { table, queryKey, filter, event = "*", enabled = true } = opts;
  const keyStr = JSON.stringify(queryKey);
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`rt:${table}:${filter ?? "*"}:${keyStr}`)
      .on(
        // @ts-expect-error supabase-js postgres_changes string-literal typing
        "postgres_changes",
        { event, schema: "public", table, ...(filter ? { filter } : {}) },
        () => {
          void qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, table, filter, event, enabled, keyStr, queryKey]);
}