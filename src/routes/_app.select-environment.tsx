import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEnvironment } from "@/lib/qa/environment";
import { usePrefs } from "@/lib/qa/prefs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Rocket, FlaskConical, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/select-environment")({
  component: SelectEnvironment,
});

function SelectEnvironment() {
  const { setEnv } = useEnvironment();
  const { prefs } = usePrefs();
  const navigate = useNavigate();

  const pick = (e: "Production" | "Stage") => {
    setEnv(e);
    navigate({ to: prefs.defaultLanding || "/dashboard" });
  };

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-4xl flex-col items-center justify-center gap-8 py-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Select your testing environment</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          All defects, forms, reports and dashboards will be filtered to this environment.
        </p>
      </div>
      <div className="grid w-full gap-4 sm:grid-cols-2">
        {[
          {
            id: "Production" as const,
            Icon: Rocket,
            tagline: "Live customer environment",
            tone: "from-emerald-500/15 to-emerald-500/5",
            ring: "ring-emerald-500/30",
            dot: "bg-emerald-500",
          },
          {
            id: "Stage" as const,
            Icon: FlaskConical,
            tagline: "Pre-release / QA environment",
            tone: "from-amber-500/15 to-amber-500/5",
            ring: "ring-amber-500/30",
            dot: "bg-amber-500",
          },
        ].map((opt) => (
          <button key={opt.id} onClick={() => pick(opt.id)} className="text-left">
            <Card
              className={cn(
                "border-border ring-1 ring-inset bg-gradient-to-br transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elevated)]",
                opt.tone,
                opt.ring,
              )}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-12 w-12 place-items-center rounded-xl text-primary-foreground"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <opt.Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{opt.id}</h3>
                    <p className="text-xs text-muted-foreground">{opt.tagline}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={cn("h-1.5 w-1.5 rounded-full", opt.dot)} />
                  Switch later from the header
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={() => pick("Production")}>
        Continue with Production
      </Button>
    </div>
  );
}
