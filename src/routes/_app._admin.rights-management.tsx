import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Search, Download, ShieldCheck } from "lucide-react";
import { MODULE_OPTIONS } from "@/lib/qa/constants";
import { useQA } from "@/lib/qa/store";
import { recordPermissionChange } from "@/lib/qa/permissionAudit";
import {
  listUserPermissionOverrides,
  setUserPermission,
} from "@/lib/qa/permissions.functions";

type Role = "admin" | "agent";
type Action = "view" | "create" | "edit" | "delete";
type PermsForUser = Record<string, Record<Action, boolean>>;
type MatrixByUser = Record<string, PermsForUser>;

const USER_TYPES: Role[] = ["admin", "agent"];
const ACTIONS: Action[] = ["view", "create", "edit", "delete"];
const PAGE_SIZE = 8;
const ALLOWED_MODULES = new Set<string>(MODULE_OPTIONS);
const ALLOWED_ACTIONS = new Set<Action>(ACTIONS);

/**
 * Critical admin permissions: an admin must not be able to revoke these on
 * themselves. Removing them could lock the admin out of the very surfaces
 * needed to restore access.
 */
function isCriticalSelfChange(
  isSelfAdmin: boolean,
  _module: string,
  _action: Action,
  next: boolean,
): boolean {
  // Block any self-revoke for an admin acting on their own row.
  return isSelfAdmin && next === false;
}

function defaultPermsForRole(role: Role): PermsForUser {
  const m: PermsForUser = {};
  for (const mod of MODULE_OPTIONS) {
    m[mod] = {
      view: true,
      create: role === "admin",
      edit: role === "admin",
      delete: role === "admin",
    };
  }
  return m;
}

export function RightsManagementPage() {
  const { users, currentUser } = useQA();
  const [matrixByUser, setMatrixByUser] = useState<MatrixByUser>({});
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [userType, setUserType] = useState<Role>("admin");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState<{
    userId: string;
    module: string;
    action: Action;
    next: boolean;
  } | null>(null);

  const eligibleUsers = useMemo(
    () => (users ?? []).filter((u) => u.active && u.role === userType),
    [users, userType],
  );

  // Keep the selected user valid as the user list (and user type) changes.
  useEffect(() => {
    if (eligibleUsers.length === 0) {
      if (selectedUserId !== "") setSelectedUserId("");
      return;
    }
    if (!eligibleUsers.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(eligibleUsers[0].id);
    }
  }, [eligibleUsers, selectedUserId]);

  const selectedUser = useMemo(
    () => eligibleUsers.find((u) => u.id === selectedUserId) ?? null,
    [eligibleUsers, selectedUserId],
  );

  // Hydrate the selected user's overrides from the backend whenever the
  // selection changes. Avoids leaking permissions between users.
  useEffect(() => {
    if (!selectedUser) return;
    let cancelled = false;
    setLoadingPerms(true);
    (async () => {
      try {
        const rows = await listUserPermissionOverrides({
          data: { userId: selectedUser.id },
        });
        if (cancelled) return;
        const base = defaultPermsForRole(selectedUser.role);
        for (const r of rows) {
          if (!base[r.module]) {
            base[r.module] = { view: false, create: false, edit: false, delete: false };
          }
          base[r.module][r.action] = r.enabled;
        }
        setMatrixByUser((prev) => ({ ...prev, [selectedUser.id]: base }));
      } catch (e) {
        if (!cancelled) {
          toast.error(
            e instanceof Error
              ? `Couldn't load permissions: ${e.message}`
              : "Couldn't load permissions",
          );
        }
      } finally {
        if (!cancelled) setLoadingPerms(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedUser]);

  const perms: PermsForUser = useMemo(() => {
    if (!selectedUser) return defaultPermsForRole(userType);
    const stored = matrixByUser[selectedUser.id];
    const base = defaultPermsForRole(selectedUser.role);
    if (!stored) return base;
    // Merge so newly added modules show defaults.
    const merged: PermsForUser = { ...base };
    for (const mod of Object.keys(stored)) merged[mod] = { ...base[mod], ...stored[mod] };
    return merged;
  }, [matrixByUser, selectedUser, userType]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return MODULE_OPTIONS.filter((m) => (term ? m.toLowerCase().includes(term) : true));
  }, [q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function apply(userId: string, module: string, action: Action, next: boolean) {
    const user = eligibleUsers.find((u) => u.id === userId);
    if (!user) {
      toast.error("Select a user first");
      return;
    }
    if (!ALLOWED_MODULES.has(module) || !ALLOWED_ACTIONS.has(action)) {
      toast.error("Unknown module or action");
      return;
    }
    const isSelfAdmin =
      !!currentUser && currentUser.id === user.id && currentUser.role === "admin";
    if (isCriticalSelfChange(isSelfAdmin, module, action, next)) {
      toast.error("Admins can't revoke their own permissions");
      return;
    }
    const prevMatrix = matrixByUser;
    setMatrixByUser((prev) => {
      const current = prev[userId] ?? defaultPermsForRole(user.role);
      return {
        ...prev,
        [userId]: {
          ...current,
          [module]: { ...current[module], [action]: next },
        },
      };
    });
    try {
      await setUserPermission({
        data: { targetUserId: user.id, module, action, enabled: next },
      });
    } catch (e) {
      // Rollback local matrix; the change never reached the server.
      setMatrixByUser(prevMatrix);
      toast.error(
        e instanceof Error
          ? `Permission update failed: ${e.message}`
          : "Permission update failed",
      );
      return;
    }
    try {
      recordPermissionChange({
        userId: user.id,
        userName: user.name || user.email || user.id,
        role: user.role,
        module,
        action,
        enabled: next,
      });
    } catch {
      /* audit failures must not break permission updates */
    }
    toast.success(
      `${next ? "Granted" : "Revoked"} ${action} on "${module}" for ${user.name || user.email}`,
    );
  }

  function onToggle(userId: string, module: string, action: Action, next: boolean) {
    // Destructive permission changes ask for confirmation.
    if (!next && (action === "delete" || action === "edit")) {
      setConfirm({ userId, module, action, next });
      return;
    }
    void apply(userId, module, action, next);
  }

  function exportJson() {
    if (!selectedUser) {
      toast.error("Select a user to export");
      return;
    }
    try {
      const payload = {
        userId: selectedUser.id,
        userName: selectedUser.name,
        role: selectedUser.role,
        permissions: perms,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `permissions-${selectedUser.name || selectedUser.id}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Permissions exported");
    } catch {
      toast.error("Export failed");
    }
  }

  function importJson(file: File) {
    if (!selectedUser) {
      toast.error("Select a user to import into");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as {
          permissions?: PermsForUser;
        };
        if (!parsed || typeof parsed !== "object" || !parsed.permissions) {
          throw new Error("Invalid file");
        }
        const incoming = parsed.permissions;
        if (!incoming || typeof incoming !== "object") {
          throw new Error("Missing permissions object");
        }
        // Reject unknown modules/actions to prevent injection via crafted JSON.
        const unknownModules: string[] = [];
        const unknownActions: string[] = [];
        const sanitized: PermsForUser = {};
        for (const [mod, row] of Object.entries(incoming)) {
          if (!ALLOWED_MODULES.has(mod)) {
            unknownModules.push(mod);
            continue;
          }
          if (!row || typeof row !== "object") continue;
          const safeRow = { view: false, create: false, edit: false, delete: false } as Record<Action, boolean>;
          for (const [a, v] of Object.entries(row)) {
            if (!ALLOWED_ACTIONS.has(a as Action)) {
              unknownActions.push(a);
              continue;
            }
            if (typeof v !== "boolean") continue;
            safeRow[a as Action] = v;
          }
          sanitized[mod] = safeRow;
        }
        if (Object.keys(sanitized).length === 0) {
          throw new Error("No valid modules in file");
        }
        const isSelfAdmin =
          !!currentUser &&
          currentUser.id === selectedUser.id &&
          currentUser.role === "admin";
        // Persist each toggle individually so the backend remains source of truth.
        const failures: string[] = [];
        for (const [mod, row] of Object.entries(sanitized)) {
          for (const a of ACTIONS) {
            if (isCriticalSelfChange(isSelfAdmin, mod, a, row[a])) continue;
            try {
              await setUserPermission({
                data: {
                  targetUserId: selectedUser.id,
                  module: mod,
                  action: a,
                  enabled: row[a],
                },
              });
            } catch (e) {
              failures.push(`${mod}/${a}`);
              if (failures.length > 5) break;
            }
          }
          if (failures.length > 5) break;
        }
        setMatrixByUser((prev) => ({
          ...prev,
          [selectedUser.id]: { ...defaultPermsForRole(selectedUser.role), ...sanitized },
        }));
        if (unknownModules.length || unknownActions.length) {
          toast.warning?.(
            `Skipped unknown ${unknownModules.length} module(s) and ${unknownActions.length} action(s)`,
          ) ?? toast.success(
            `Imported with ${unknownModules.length + unknownActions.length} skipped`,
          );
        }
        if (failures.length) {
          toast.error(`Some updates failed: ${failures.slice(0, 3).join(", ")}`);
        } else {
          toast.success("Permissions imported");
        }
      } catch (e) {
        toast.error(
          e instanceof Error ? `Invalid permissions file: ${e.message}` : "Invalid permissions file",
        );
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
            Manage per-user module and feature access. Permission changes are recorded
            in the Permission Audit History under Settings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={userType}
            onValueChange={(v) => {
              setUserType(v as Role);
              setSelectedUserId("");
            }}
          >
            <SelectTrigger className="w-[140px]" aria-label="User type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USER_TYPES.map((r) => (
                <SelectItem key={r} value={r} className="capitalize">
                  {r === "admin" ? "Admin" : "Agent"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={selectedUserId || undefined}
            onValueChange={(v) => setSelectedUserId(v)}
            disabled={eligibleUsers.length === 0}
          >
            <SelectTrigger className="w-[220px]" aria-label="User">
              <SelectValue
                placeholder={
                  eligibleUsers.length === 0
                    ? `No active ${userType}s`
                    : `Select ${userType}…`
                }
              />
            </SelectTrigger>
            <SelectContent>
              {eligibleUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name || u.email || u.id}
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
          <Button variant="outline" onClick={exportJson} disabled={!selectedUser}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept="application/json"
              className="hidden"
              disabled={!selectedUser}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJson(f);
                e.currentTarget.value = "";
              }}
            />
            <span
              className={`inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm font-medium ${
                selectedUser ? "cursor-pointer hover:bg-accent" : "cursor-not-allowed opacity-50"
              }`}
            >
              Import
            </span>
          </label>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Permissions —{" "}
            <span>
              {selectedUser
                ? `${selectedUser.name || selectedUser.email} (${selectedUser.role})`
                : `No ${userType} selected`}
            </span>
            {loadingPerms && (
              <span className="ml-2 text-xs text-muted-foreground">loading…</span>
            )}
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
                  const row = perms[mod] ?? {
                    view: false,
                    create: false,
                    edit: false,
                    delete: false,
                  };
                  const enabledCount = ACTIONS.filter((a) => row[a]).length;
                  return (
                    <TableRow key={mod}>
                      <TableCell className="font-medium">{mod}</TableCell>
                      {ACTIONS.map((a) => (
                        <TableCell key={a} className="text-center">
                          <Switch
                            checked={row[a]}
                            disabled={!selectedUser}
                            onCheckedChange={(c) =>
                              selectedUser && onToggle(selectedUser.id, mod, a, c)
                            }
                            aria-label={`${a} ${mod} for ${
                              selectedUser?.name || selectedUser?.email || userType
                            }`}
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

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke permission?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (
                <>
                  This will revoke <strong className="capitalize">{confirm.action}</strong>{" "}
                  on <strong>{confirm.module}</strong> for the{" "}
                  <strong>
                    {eligibleUsers.find((u) => u.id === confirm.userId)?.name ||
                      "selected user"}
                  </strong>
                  .
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm)
                  apply(confirm.userId, confirm.module, confirm.action, confirm.next);
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
