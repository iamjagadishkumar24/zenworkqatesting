import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ExportJobRow = Database["public"]["Tables"]["export_jobs"]["Row"];

export function useExportJob(jobId: string | null) {
  const [job, setJob] = useState<ExportJobRow | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("export_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setJob(data as ExportJobRow);
      });

    const channelName = `export-job-${jobId}-${Math.random().toString(36).slice(2, 8)}`;
    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "export_jobs", filter: `id=eq.${jobId}` },
        (payload) => setJob(payload.new as ExportJobRow),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [jobId]);

  return job;
}

export function useAllowAgentExports() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "allow_agent_exports")
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setAllowed(data?.value === true);
        });
    load();
    const ch = supabase
      .channel(`app-settings-allow-agent-exports-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_settings",
          filter: "key=eq.allow_agent_exports",
        },
        () => load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);
  return allowed;
}
