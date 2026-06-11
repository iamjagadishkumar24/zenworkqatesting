import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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

export function FormsCatalog({
  module, title, description, forms = FORM_LIST,
}: {
  module: Module;
  title: string;
  description: string;
  forms?: string[];
}) {
  const { defects } = useQA();
  const { env } = useEnvironment();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  // 2290-related forms and the retired "Form 1099 Corrections" never appear
  // here — 2290 lives under its dedicated module page.
  const visibleForms = useMemo(() => excludeNonCatalogForms(forms), [forms]);

  const list = useMemo(
    () => visibleForms.filter((n) => (q ? n.toLowerCase().includes(q.toLowerCase()) : true)),
    [visibleForms, q],
  );

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
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search forms…" className="pl-9" />
        </div>
      </div>

      {list.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 h-8 w-8 opacity-40" />
          No forms match "{q}".
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((name) => {
            const open = openCountByForm.get(name) ?? 0;
            return (
              <Card key={name} className="group border-border transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
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
                        <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10">
                          <Bug className="h-3 w-3" /> {open}
                        </Badge>
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{module}</p>
                  <Button
                    size="sm" variant="outline" className="mt-3 w-full"
                    onClick={() => setPicked(name)}
                  >Report Error</Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ReportDefectDialog
        open={!!picked}
        onOpenChange={(o) => { if (!o) setPicked(null); }}
        defaultForm={picked ?? ""}
        defaultModule={module}
      />
    </div>
  );
}