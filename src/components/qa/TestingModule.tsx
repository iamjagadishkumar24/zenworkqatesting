import { useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DefectStatusBadge, PriorityBadge } from "./StatusBadge";
import { DefectDetailSheet } from "./DefectDetailSheet";
import { ReportDefectDialog } from "./ReportDefectDialog";
import { Bug, Plus, Search } from "lucide-react";
import { AGENTS } from "@/lib/qa/constants";
import type { Module, QbDesktopCategory } from "@/lib/qa/types";
import { QB_DESKTOP_CATEGORIES } from "@/lib/qa/types";

/**
 * Generic testing module page. Used for Integrations, Chatbot Testing,
 * Functionality Testing, Tax1099 Features and the 2290 sub-forms.
 *
 * It shows a catalog of sub-items (e.g. integration names or 2290 forms),
 * lets the user open a defect list scoped to that sub-item and the active
 * environment, and report a new defect.
 */
export function TestingModule({
  title,
  description,
  module,
  items,
  itemLabel = "item",
  showHeaderReport = true,
}: {
  title: string;
  description: string;
  module: Module; // DB-stored module
  items: string[];
  itemLabel?: string;
  showHeaderReport?: boolean;
}) {
  const { defects, currentUser } = useQA();
  const { env } = useEnvironment();
  const isAdmin = currentUser?.role === "admin";

  const [picked, setPicked] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [qbCategory, setQbCategory] = useState<QbDesktopCategory | null>(null);
  const [reportQbCategory, setReportQbCategory] = useState<QbDesktopCategory | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const visibleItems = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((n) => (term ? n.toLowerCase().includes(term) : true));
  }, [items, q]);

  const openCount = (name: string) =>
    defects.filter(
      (d) =>
        d.module === module &&
        d.formFeature.includes(name) &&
        (!env || d.environment === env) &&
        !["Fixed", "Closed"].includes(d.status),
    ).length;

  const scopedDefects = useMemo(() => {
    if (!picked) return [];
    const me = currentUser?.name ?? "";
    return defects
      .filter((d) => d.module === module && d.formFeature.includes(picked))
      .filter((d) => !env || d.environment === env)
      .filter((d) =>
        picked === "QuickBooks Desktop" && qbCategory ? d.qbDesktopCategory === qbCategory : true,
      )
      .filter((d) => isAdmin || d.assignedAgent === me || d.createdBy === me)
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }, [picked, qbCategory, defects, module, env, isAdmin, currentUser]);

  const isQbDesktop = module === "Integrations" && picked === "QuickBooks Desktop";
  const qbCategoryCount = (c: QbDesktopCategory) =>
    defects.filter(
      (d) =>
        d.module === module &&
        d.formFeature.includes("QuickBooks Desktop") &&
        (!env || d.environment === env) &&
        d.qbDesktopCategory === c,
    ).length;

  // Agents only get their own name in the assigned dropdown
  const allowedAgents = isAdmin ? AGENTS : currentUser ? [currentUser.name] : [];

  // Feature-based modules report errors against the selected item (no form/integration dropdowns).
  const featureMode =
    module !== "Integrations" &&
    module !== "1099 Forms" &&
    module !== "1099 Online" &&
    module !== "990 Forms";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2">
          <div className="relative w-72 max-w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${itemLabel}s…`}
              className="pl-9"
            />
          </div>
          {showHeaderReport && (
            <Button
              onClick={() => {
                setReportFor(picked ?? items[0] ?? "");
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> Report defect
            </Button>
          )}
        </div>
      </div>

      {!picked ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleItems.map((name) => {
            const open = openCount(name);
            return (
              <Card
                key={name}
                className="group border-border transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPicked(name)}
                      className="text-left font-semibold leading-tight hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      {name}
                    </button>
                    {open > 0 && (
                      <button
                        type="button"
                        onClick={() => setPicked(name)}
                        aria-label={`View ${open} reported error(s)`}
                      >
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                        >
                          <Bug className="h-3 w-3" /> {open}
                        </Badge>
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground capitalize">{itemLabel}</p>
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => {
                      if (module === "Integrations" && name === "QuickBooks Desktop") {
                        setPicked(name);
                      } else {
                        setReportFor(name);
                      }
                    }}
                  >
                    Report Error
                  </Button>
                </CardContent>
              </Card>
            );
          })}
          {visibleItems.length === 0 && (
            <Card className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                Nothing matches "{q}".
              </CardContent>
            </Card>
          )}
        </div>
      ) : isQbDesktop && !qbCategory ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
              ← Back to {itemLabel}s
            </Button>
            <span className="font-medium">QuickBooks Desktop</span>
            {env && (
              <Badge variant="outline" className="ml-2">
                {env}
              </Badge>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {QB_DESKTOP_CATEGORIES.map((c) => {
              const count = qbCategoryCount(c);
              return (
                <Card key={c} className="border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold leading-tight">{c}</div>
                      <Badge variant="outline" className="gap-1">
                        <Bug className="h-3 w-3" /> {count}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {count} error{count === 1 ? "" : "s"}
                    </p>
                    <div className="flex flex-col gap-2">
                      <Button size="sm" variant="outline" onClick={() => setQbCategory(c)}>
                        View Errors
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setReportQbCategory(c);
                          setReportFor("QuickBooks Desktop");
                        }}
                      >
                        Report Error
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            {isQbDesktop ? (
              <Button variant="ghost" size="sm" onClick={() => setQbCategory(null)}>
                ← Back to categories
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
                ← Back to {itemLabel}s
              </Button>
            )}
            <span className="font-medium">{picked}</span>
            {isQbDesktop && qbCategory && <Badge variant="secondary">{qbCategory}</Badge>}
            {env && (
              <Badge variant="outline" className="ml-2">
                {env}
              </Badge>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scopedDefects.map((d) => (
                    <TableRow key={d.id} className="cursor-pointer" onClick={() => setViewId(d.id)}>
                      <TableCell className="font-mono text-xs">{d.id}</TableCell>
                      <TableCell className="max-w-[320px] truncate font-medium">
                        {d.title}
                      </TableCell>
                      <TableCell>
                        <DefectStatusBadge status={d.status} />
                      </TableCell>
                      <TableCell>
                        <PriorityBadge value={d.priority} />
                      </TableCell>
                      <TableCell className="text-sm">{d.assignedAgent}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(d.updatedAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {scopedDefects.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-12 text-center text-sm text-muted-foreground"
                      >
                        <Bug className="mx-auto mb-2 h-8 w-8 opacity-40" />
                        No defects reported for {picked} in {env ?? "any environment"} yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <ReportDefectDialog
        open={!!reportFor}
        onOpenChange={(o) => {
          if (!o) {
            setReportFor(null);
            setReportQbCategory(null);
          }
        }}
        defaultForm={module === "Integrations" ? "" : (reportFor ?? "")}
        defaultModule={module}
        defaultAgents={allowedAgents}
        defaultIntegration={module === "Integrations" ? (reportFor ?? "") : ""}
        featureMode={featureMode}
        formOptions={module === "Integrations" ? ["Form 1099-NEC", "Form 1099-MISC"] : undefined}
        defaultQbCategory={reportQbCategory ?? undefined}
        lockQbCategory={!!reportQbCategory}
      />
      <DefectDetailSheet
        defectId={viewId}
        open={!!viewId}
        onOpenChange={(o) => {
          if (!o) setViewId(null);
        }}
      />
    </div>
  );
}
