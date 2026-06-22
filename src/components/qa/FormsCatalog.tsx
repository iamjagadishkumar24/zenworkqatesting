import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Bug, FileText } from "lucide-react";
import { FORM_LIST, decodeFormFeature } from "@/lib/qa/constants";
import { excludeNonCatalogForms } from "@/lib/qa/scope";
import { ReportDefectDialog } from "./ReportDefectDialog";
import type { Module } from "@/lib/qa/types";
import { useRetests } from "@/lib/qa/retest";
import { cn } from "@/lib/utils";

// Schedules / related forms that can be reported under a parent 990-series form.
// These are NOT separate modules — only multi-select options inside the parent
// form's Report dialog.
const SCHEDULES_BY_FORM: Record<string, string[]> = {
  "Form 990": [
    "Form 4562",
    "Form 8868",
    "Form 4466",
    "Form 2220",
    "Form 990-T",
    "Schedule A",
    "Schedule B",
    "Schedule C",
    "Schedule D",
    "Schedule E",
    "Schedule F",
    "Schedule G",
    "Schedule H",
    "Schedule I",
    "Schedule J",
    "Schedule K",
    "Schedule L",
    "Schedule M",
    "Schedule N",
    "Schedule R",
    "Schedule O",
  ],
  "Form 990-T": [
    "Form 4562",
    "Form 4797",
    "Form 4626",
    "Schedule A (990-T)",
    "Form 3800",
    "Supplemental Information",
  ],
  "Form 990-EZ": [
    "Schedule A",
    "Schedule B",
    "Schedule C",
    "Schedule E",
    "Schedule G",
    "Schedule L",
    "Schedule N",
    "Schedule O",
  ],
  "Form 990-PF": ["Supplemental Information"],
};

export function FormsCatalog({
  module,
  title,
  description,
  forms = FORM_LIST,
  featureMode = false,
}: {
  module: Module;
  title: string;
  description: string;
  forms?: string[];
  /** When true, the Report dialog hides the form dropdown and shows the picked form as a read-only Feature. */
  featureMode?: boolean;
}) {
  const { defects, currentUser } = useQA();
  const { env } = useEnvironment();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  // Honor `?q=` and `?assignment=` deep-links from dashboard / task list.
  const search = useSearch({ strict: false }) as { q?: string; assignment?: string };
  useEffect(() => {
    if (typeof search?.q === "string") setQ(search.q);
  }, [search?.q]);

  // Forms currently assigned (open) — used to badge cards.
  const { items: retestItems } = useRetests();
  const assignedFormsByName = useMemo(() => {
    const map = new Map<string, { mine: boolean; agent: string }>();
    for (const r of retestItems) {
      if (r.status === "Completed") continue;
      const mine = r.assigned_agent_id === currentUser?.id;
      for (const f of r.forms) {
        const prev = map.get(f.form_name);
        // Prefer "mine" over someone else's assignment
        if (!prev || (mine && !prev.mine)) {
          map.set(f.form_name, { mine, agent: r.assigned_agent_name });
        }
      }
    }
    return map;
  }, [retestItems, currentUser]);

  // 2290-related forms and the retired "Form 1099 Corrections" never appear
  // here — 2290 lives under its dedicated module page.
  const visibleForms = useMemo(() => excludeNonCatalogForms(forms), [forms]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return visibleForms.filter((n) => (term ? n.toLowerCase().includes(term) : true));
  }, [visibleForms, q]);

  const openCountByForm = useMemo(() => {
    const map = new Map<string, number>();
    defects.forEach((d) => {
      if (d.module !== module) return;
      if (env && d.environment && d.environment !== env) return;
      if (["Fixed", "Closed"].includes(d.status)) return;
      const { form } = decodeFormFeature(d.formFeature);
      map.set(form, (map.get(form) ?? 0) + 1);
    });
    return map;
  }, [defects, module, env]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search forms…"
            className="pl-9"
          />
        </div>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
            No forms match "{q}".
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((name) => {
            const open = openCountByForm.get(name) ?? 0;
            const assigned = assignedFormsByName.get(name);
            return (
              <Card
                key={name}
                className={cn(
                  "group border-border transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]",
                  assigned?.mine && "border-primary/60 ring-1 ring-primary/20",
                  assigned && !assigned.mine && "border-amber-500/40",
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to="/my-reported-errors"
                      search={{ q: name } as never}
                      className="font-semibold leading-tight hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      {name}
                    </Link>
                    {open > 0 && (
                      <Link to="/my-reported-errors" search={{ q: name } as never}>
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                        >
                          <Bug className="h-3 w-3" /> {open}
                        </Badge>
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{module}</p>
                  {assigned && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-2 text-[10px]",
                        assigned.mine
                          ? "border-primary/50 text-primary"
                          : "border-amber-500/40 text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {assigned.mine ? "Assigned to you" : `Assigned: ${assigned.agent}`}
                    </Badge>
                  )}
                  <Button size="sm" className="mt-3 w-full" onClick={() => setPicked(name)}>
                    Report Error
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ReportDefectDialog
        open={!!picked}
        onOpenChange={(o) => {
          if (!o) setPicked(null);
        }}
        defaultForm={picked ?? ""}
        defaultModule={module}
        featureMode={featureMode}
        scheduleOptions={picked ? SCHEDULES_BY_FORM[picked] : undefined}
      />
    </div>
  );
}
