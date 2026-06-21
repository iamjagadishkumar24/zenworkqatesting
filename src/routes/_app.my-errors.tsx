import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DefectStatusBadge, PriorityBadge } from "@/components/qa/StatusBadge";
import { DefectDetailSheet } from "@/components/qa/DefectDetailSheet";
import { ExportMenu } from "@/components/qa/ExportMenu";
import { Eye, Pencil, Search, ShieldCheck, ShieldX } from "lucide-react";
import type { DefectStatus, Module, Priority, Severity } from "@/lib/qa/types";
import { toast } from "sonner";
import { validateFilters, buildEmptyResultMessage } from "@/lib/qa/filterValidation";

const DEFECT_STATUSES: DefectStatus[] = [
  "Reported",
  "Pending",
  "Ongoing",
  "In Progress",
  "Fixed",
  "Retest Required",
  "Reopened",
  "Closed",
];
const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Critical"];
const SEVERITIES: Severity[] = ["Low", "Medium", "High", "Critical"];
const MODULES: Module[] = ["1099 Forms", "990 Forms", "Integrations", "1099 Online"];

export const Route = createFileRoute("/_app/my-errors")({
  component: MyErrorsPage,
});

function MyErrorsPage() {
  const { defects, currentUser } = useQA();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "reported" | "assigned">("all");
  const [mod, setMod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [prio, setPrio] = useState<string>("all");
  const [sev, setSev] = useState<string>("all");
  const [agent, setAgent] = useState<string>("all");

  const myAgents = useMemo(() => {
    const me = currentUser?.name ?? "";
    const set = new Set<string>();
    defects.forEach((d) => {
      if (d.assignedAgent === me || d.createdBy === me) set.add(d.assignedAgent);
    });
    return Array.from(set).filter(Boolean).sort();
  }, [defects, currentUser]);

  const mine = useMemo(() => {
    const me = currentUser?.name ?? "";
    const term = q.trim().toLowerCase();
    return defects.filter((d) => {
      if (d.assignedAgent !== me && d.createdBy !== me) return false;
      if (scope === "reported" && d.createdBy !== me) return false;
      if (scope === "assigned" && d.assignedAgent !== me) return false;
      if (mod !== "all" && d.module !== mod) return false;
      if (status !== "all" && d.status !== status) return false;
      if (prio !== "all" && d.priority !== prio) return false;
      if (sev !== "all" && d.severity !== sev) return false;
      if (agent !== "all" && d.assignedAgent !== agent) return false;
      if (!term) return true;
      return [
        d.id,
        d.title,
        d.formFeature,
        d.module,
        d.status,
        d.priority,
        d.severity,
        d.assignedAgent,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [defects, currentUser, q, scope, mod, status, prio, sev, agent]);

  const resetFilters = () => {
    setQ("");
    setScope("all");
    setMod("all");
    setStatus("all");
    setPrio("all");
    setSev("all");
    setAgent("all");
  };

  const lastToastRef = useRef<string>("");
  useEffect(() => {
    const filters = {
      q,
      module: mod,
      status,
      priority: prio,
      severity: sev,
      assignedAgent: agent,
      scope,
    };
    const warnings = validateFilters(filters, defects);
    if (warnings.length) {
      const key = "warn:" + warnings.join("|");
      if (key !== lastToastRef.current) {
        lastToastRef.current = key;
        warnings.forEach((w) => toast.warning(w));
      }
      return;
    }
    if (mine.length === 0) {
      const msg = buildEmptyResultMessage(filters, warnings);
      const key = "empty:" + msg;
      if (key !== lastToastRef.current) {
        lastToastRef.current = key;
        toast.info(msg);
      }
    } else {
      lastToastRef.current = "";
    }
  }, [q, scope, mod, status, prio, sev, agent, mine.length, defects]);

  const reported = mine.filter((d) => d.createdBy === currentUser?.name);
  const assigned = mine.filter((d) => d.assignedAgent === currentUser?.name);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Error Sheet</h2>
          <p className="text-sm text-muted-foreground">
            Errors you reported and defects assigned to you. {reported.length} reported ·{" "}
            {assigned.length} assigned.
          </p>
        </div>
        <ExportMenu
          filename="my-errors"
          title="My errors export"
          filters={{ Agent: currentUser?.name ?? "—", Count: mine.length }}
          rows={mine.map(({ comments, ...d }) => ({ ...d, commentsCount: comments.length }))}
          columns={[
            "id",
            "module",
            "formFeature",
            "title",
            "status",
            "priority",
            "severity",
            "validity",
            "assignedAgent",
            "createdBy",
            "updatedAt",
          ]}
          defaultSelected={[
            "id",
            "module",
            "formFeature",
            "title",
            "status",
            "priority",
            "validity",
            "updatedAt",
          ]}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-7">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search my errors…"
                className="pl-9"
              />
            </div>
            <FilterSelect
              value={scope}
              onChange={(v) => setScope(v as typeof scope)}
              placeholder="Scope"
              options={[
                { v: "all", l: "All mine" },
                { v: "reported", l: "Reported by me" },
                { v: "assigned", l: "Assigned to me" },
              ]}
            />
            <FilterSelect
              value={mod}
              onChange={setMod}
              placeholder="Module"
              options={[{ v: "all", l: "All modules" }, ...MODULES.map((m) => ({ v: m, l: m }))]}
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              placeholder="Status"
              options={[
                { v: "all", l: "All statuses" },
                ...DEFECT_STATUSES.map((s) => ({ v: s, l: s })),
              ]}
            />
            <FilterSelect
              value={prio}
              onChange={setPrio}
              placeholder="Priority"
              options={[
                { v: "all", l: "All priorities" },
                ...PRIORITIES.map((p) => ({ v: p, l: p })),
              ]}
            />
            <FilterSelect
              value={sev}
              onChange={setSev}
              placeholder="Severity"
              options={[
                { v: "all", l: "All severities" },
                ...SEVERITIES.map((p) => ({ v: p, l: p })),
              ]}
            />
            <FilterSelect
              value={agent}
              onChange={setAgent}
              placeholder="Assigned"
              options={[{ v: "all", l: "All agents" }, ...myAgents.map((a) => ({ v: a, l: a }))]}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {mine.length} result{mine.length === 1 ? "" : "s"}
            </span>
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              Reset filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Form / Feature</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mine.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => setOpenId(d.id)}>
                  <TableCell className="font-mono text-xs">{d.id}</TableCell>
                  <TableCell className="text-sm">{d.module}</TableCell>
                  <TableCell className="text-sm">{d.formFeature}</TableCell>
                  <TableCell className="max-w-[280px] truncate font-medium">{d.title}</TableCell>
                  <TableCell>
                    <DefectStatusBadge status={d.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge value={d.priority} />
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                      {d.validity === "Valid" && <ShieldCheck className="h-3 w-3 text-success" />}
                      {d.validity === "Invalid" && <ShieldX className="h-3 w-3 text-destructive" />}
                      {d.validity ?? "Unverified"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(d.updatedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(d.id);
                        }}
                        aria-label="View"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {d.createdBy === currentUser?.name && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditId(d.id);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {mine.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No errors found for you yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DefectDetailSheet
        defectId={openId}
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
      />
      <DefectDetailSheet
        defectId={editId}
        open={!!editId}
        initialEdit
        onOpenChange={(o) => {
          if (!o) setEditId(null);
        }}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { v: string; l: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.v} value={o.v}>
            {o.l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
