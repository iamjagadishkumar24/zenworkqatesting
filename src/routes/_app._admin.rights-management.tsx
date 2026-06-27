import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Search, Download, ShieldCheck, History } from "lucide-react";
import { MODULE_OPTIONS } from "@/lib/qa/constants";

type Role = "admin" | "agent";
type Action = "view" | "create" | "edit" | "delete";
type Matrix = Record<Role, Record<string, Record<Action, boolean>>>;

const ROLES: Role[] = ["admin", "agent"];
const ACTIONS: Action[] = ["view", "create", "edit", "delete"];
const PAGE_SIZE = 8;

function defaultMatrix(): Matrix {
  const m = {} as Matrix;
  for (const r of ROLES) {
    m[r] = {};
    for (const mod of MODULE_OPTIONS) {
      m[r][mod] = {
        view: true,
        create: r === "admin",
        edit: r === "admin",
        delete: r === "admin",
      };
    }
  }
  return m;
}

type AuditEntry = {
  id: string;
  at: string;
  role: Role;
  module: string;
  action: Action;
  enabled: boolean;
};

export function RightsManagementPage() {
  const [matrix, setMatrix] = useState<Matrix>(() => defaultMatrix());
  const [role, setRole] = useState<Role>("admin");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [confirm, setConfirm] = useState<{
    role: Role;
    module: string;
    action: Action;
    next: boolean;
  } | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return MODULE_OPTIONS.filter((m) => (term ? m.toLowerCase().includes(term) : true));
  }, [q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function apply(role: Role, module: string, action: Action, next: boolean) {
    setMatrix((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [module]: { ...prev[role][module], [action]: next },
      },
    }));
    setAudit((prev) => [
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        role,
        module,
        action,
        enabled: next,
      },
      ...prev,
    ]);
    toast.success(
      `${next ? "Granted" : "Revoked"} ${action} on "${module}" for ${role}`,
    );
  }

  function onToggle(role: Role, module: string, action: Action, next: boolean) {
    // Destructive permission changes ask for confirmation.
    if (!next && (action === "delete" || action === "edit")) {
      setConfirm({ role, module, action, next });
      return;
    }
    apply(role, module, action, next);
  }

  function exportJson() {
    try {
      const blob = new Blob([JSON.stringify(matrix, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rights-matrix-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Permissions exported");
    } catch {
      toast.error("Export failed");
    }
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Matrix;
        if (!parsed.admin || !parsed.agent) throw new Error("Invalid file");
        setMatrix(parsed);
        toast.success("Permissions imported");
      } catch {
        toast.error("Invalid permissions file");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Rights Management
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage role-based module and feature access. Changes are tracked in the audit
            history below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="w-[140px]" aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search modules…"
              className="w-64 pl-9"
            />
          </div>
          <Button variant="outline" onClick={exportJson}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJson(f);
                e.currentTarget.value = "";
              }}
            />
            <span className="inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
              Import
            </span>
          </label>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Permissions — <span className="capitalize">{role}</span>
          </CardTitle>
          <CardDescription>
            Toggle View / Create / Edit / Delete access per module. Revoking edit or delete
            asks for confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Module</TableHead>
                  {ACTIONS.map((a) => (
                    <TableHead key={a} className="text-center capitalize">
                      {a}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((mod) => {
                  const perms = matrix[role][mod];
                  const enabledCount = ACTIONS.filter((a) => perms[a]).length;
                  return (
                    <TableRow key={mod}>
                      <TableCell className="font-medium">{mod}</TableCell>
                      {ACTIONS.map((a) => (
                        <TableCell key={a} className="text-center">
                          <Switch
                            checked={perms[a]}
                            onCheckedChange={(c) => onToggle(role, mod, a, c)}
                            aria-label={`${a} ${mod} for ${role}`}
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <Badge variant="outline">{enabledCount}/4</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {pageItems.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      No modules match "{q}".
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} · {filtered.length} modules
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Permission audit history
          </CardTitle>
          <CardDescription>
            Last {audit.length} change{audit.length === 1 ? "" : "s"} in this session.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.slice(0, 20).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(a.at).toLocaleString()}
                  </TableCell>
                  <TableCell className="capitalize">{a.role}</TableCell>
                  <TableCell>{a.module}</TableCell>
                  <TableCell className="capitalize">{a.action}</TableCell>
                  <TableCell>
                    <Badge variant={a.enabled ? "default" : "outline"}>
                      {a.enabled ? "Granted" : "Revoked"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {audit.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No permission changes yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke permission?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (
                <>
                  This will revoke <strong className="capitalize">{confirm.action}</strong>{" "}
                  on <strong>{confirm.module}</strong> for the{" "}
                  <strong className="capitalize">{confirm.role}</strong> role.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) apply(confirm.role, confirm.module, confirm.action, confirm.next);
                setConfirm(null);
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Route = createFileRoute("/_app/_admin/rights-management")({
  component: RightsManagementPage,
});
