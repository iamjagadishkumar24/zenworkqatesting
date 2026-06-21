import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PrefsInput = z.object({
  theme: z.enum(["system", "light", "dark"]),
  accent: z.enum([
    "blue", "violet", "emerald", "rose",
    "light", "green", "purple", "orange", "pink", "grey", "teal",
  ]),
  density: z.enum(["comfortable", "compact"]),
  default_landing: z.enum(["/dashboard", "/my-reported-errors", "/my-errors"]),
  show_kpi_cards: z.boolean(),
  show_trend_chart: z.boolean(),
  show_agent_chart: z.boolean(),
});

const RuntimeAuditPageSize = z.union([
  z.literal(10),
  z.literal(25),
  z.literal(50),
  z.literal(100),
]);

export type RemotePrefs = z.infer<typeof PrefsInput>;

export const getMyPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_preferences")
      .select(
        "theme, accent, density, default_landing, show_kpi_cards, show_trend_chart, show_agent_chart",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as RemotePrefs | null;
  });

export const saveMyPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PrefsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_preferences")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getMyRuntimeAuditPageSize = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_preferences")
      .select("runtime_audit_page_size")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.runtime_audit_page_size ?? 25) as 10 | 25 | 50 | 100;
  });

export const setMyRuntimeAuditPageSize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ pageSize: RuntimeAuditPageSize }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        { user_id: userId, runtime_audit_page_size: data.pageSize },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });