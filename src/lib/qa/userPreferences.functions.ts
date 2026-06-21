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