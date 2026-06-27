import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { useAgentInvites, type AgentInviteStatus } from "@/lib/qa/agents";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
import { UserPlus, Trash2, Users, Send, Eye, RotateCcw, KeyRound, Pencil } from "lucide-react";
import { AgentDetailDrawer } from "@/components/qa/AgentDetailDrawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

const PROTECTED_ADMIN_EMAIL = "admin@qaportal.app";

type PurgeCounts = {
  name: string;
  defects: number;
  retest_assignments: number;
  notifications: number;
  forms_cleared: number;
  pending_retests: number;
  total: number;
};

export const Route = createFileRoute("/_app/agents")({
  component: AgentsPage,
  errorComponent: ({ error, reset }) => (
    <div className="rounded-lg border bg-card p-6 text-center">
      <h2 className="text-lg font-semibold">Unable to load agent management.</h2>
      <p className="mt-1 text-sm text-muted-foreground">{error?.message ?? "Please try again."}</p>
      <Button className="mt-4" onClick={() => reset()}>
        Retry
      </Button>
    </div>
  ),
});

function AgentsPage() {
  const { currentUser, users, defects } = useQA();
  const {
    items,
    loading,
    create,
    setStatus,
    remove,
    deactivate,
    reactivate,
    resend,
    resetPassword,
    updateProfile,
  } = useAgentInvites();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [viewing, setViewing] = useState<{ id: string | null; name: string; email: string } | null>(
    null,
  );
  const [showInactive, setShowInactive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    userId: string | null;
    inviteId: string | null;
    name: string;
  } | null>(null);
  const [pwTarget, setPwTarget] = useState<{ userId: string; name: string } | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [editTarget, setEditTarget] = useState<{
    userId: string;
    name: string;
    email: string;
    role: "admin" | "agent";
    active: boolean;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<{ name: string } | null>(null);
  const [purgePreview, setPurgePreview] = useState<PurgeCounts | null>(null);
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeRunning, setPurgeRunning] = useState(false);

  useEffect(() => {
    if (!purgeTarget) {
      setPurgePreview(null);
      return;
    }
    let cancelled = false;
    setPurgeLoading(true);
    void (async () => {
      const { data, error } = await supabase.rpc("preview_agent_purge", {
        _name: purgeTarget.name,
      });
      if (cancelled) return;
      setPurgeLoading(false);
      if (error) {
        toast.error(error.message);
        setPurgeTarget(null);
        return;
      }
      setPurgePreview(data as unknown as PurgeCounts);
    })();
    return () => {
      cancelled = true;
    };
  }, [purgeTarget]);

  const confirmPermanentDelete = async () => {
    if (!purgeTarget) return;
    setPurgeRunning(true);
    const { data, error } = await supabase.rpc("purge_agent_data", { _name: purgeTarget.name });
    setPurgeRunning(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const c = (data ?? {}) as { total_rows?: number };
    toast.success(`${purgeTarget.name} permanently deleted (${c.total_rows ?? 0} records purged).`);
    setPurgeTarget(null);
  };

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") return;
    void (async () => {
      try {
        const { data } = await supabase.from("retest_assignments").select("assigned_agent_id");
        const map: Record<string, number> = {};
        for (const r of data ?? []) {
          const id = (r as { assigned_agent_id: string | null }).assigned_agent_id;
          if (id) map[id] = (map[id] ?? 0) + 1;
        }
        setTaskCounts(map);
      } catch {
        /* noop */
      }
    })();
  }, [currentUser, items.length]);

  const errorCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of defects) {
      const k = (d.createdBy || "").toLowerCase();
      if (k) m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [defects]);

  if (!currentUser) return null;
  if (currentUser.role !== "admin") return <Navigate to="/dashboard" replace />;

  const submit = async () => {
    setSubmitting(true);
    const r = await create({ email, name, notes });
    setSubmitting(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Agent added. They can now register with this email.");
    setEmail("");
    setName("");
    setNotes("");
  };

  // Merge: any registered agent without an invite row is shown as "active (direct signup)"
  const inviteEmails = new Set(items.map((i) => i.email.toLowerCase()));
  const directAgents = users
    .filter((u) => u.role === "agent" && !inviteEmails.has(u.email.toLowerCase()))
    .map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      status: (u.active ? "active" : "inactive") as AgentInviteStatus,
      notes: "",
      user_id: u.id,
      created_at: "",
      isInvite: false,
    }));
  const inviteRows = items.map((i) => ({ ...i, isInvite: true }));
  const rows = [...inviteRows, ...directAgents];

  const resendInvite = async (row: { email: string; name: string }) => {
    const r = await resend(row.email);
    if (!r.ok) {
      // Clear, status-aware feedback
      if (r.status === "already_active") {
        toast.warning(r.message);
      } else if (r.status === "inactive") {
        toast.error(r.message);
      } else {
        toast.error(r.message);
      }
      return;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/login?signup=1&email=${encodeURIComponent(row.email)}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success(
        `Invite refreshed — link copied for ${row.name} (status: Pending Registration)`,
      );
    } catch {
      toast.message(`Invite refreshed for ${row.name}`, { description: link });
    }
  };

  const visibleRows = rows.filter((r) => {
    const isProtectedAdmin = r.email.toLowerCase() === PROTECTED_ADMIN_EMAIL;
    if (isProtectedAdmin) return false; // shown separately
    if (showInactive) return r.status === "inactive";
    return r.status !== "inactive";
  });
  const adminRow = rows.find((r) => r.email.toLowerCase() === PROTECTED_ADMIN_EMAIL);

  const onDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.userId) {
      const res = await deactivate(confirmDelete.userId);
      if (!res.ok) toast.error(res.error);
      else toast.success(`${confirmDelete.name} removed. Their reported errors remain in history.`);
    } else if (confirmDelete.inviteId) {
      const res = await remove(confirmDelete.inviteId);
      if (!res.ok) toast.error(res.error);
      else toast.success("Invite removed");
    }
    setConfirmDelete(null);
  };

  const submitPasswordReset = async () => {
    if (!pwTarget) return;
    if (pwValue.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setPwSaving(true);
    const res = await resetPassword(pwTarget.userId, pwValue);
    setPwSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Password updated for ${pwTarget.name}`);
    setPwTarget(null);
    setPwValue("");
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    const res = await updateProfile(editTarget.userId, {
      name: editTarget.name,
      email: editTarget.email,
      role: editTarget.role,
      active: editTarget.active,
    });
    setEditSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Agent updated");
    setEditTarget(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Agent Management</h2>
        <p className="text-sm text-muted-foreground">
          Invite-only access: agents can register only after you add their email below. Removed
          agents lose login access immediately, but their reported errors remain saved for reports &
          audits.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base inline-flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Add Agent
          </CardTitle>
          <CardDescription>
            The agent must register with the same email — uninvited emails are blocked.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Agent name"
            />
          </div>
          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@example.com"
            />
          </div>
          <div className="md:col-span-3">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes about this agent's scope or permissions."
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Adding…" : "Add Agent"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base inline-flex items-center gap-2">
                <Users className="h-4 w-4" /> Agents
              </CardTitle>
              <CardDescription>
                {loading
                  ? "Loading…"
                  : showInactive
                    ? `${visibleRows.length} removed/inactive`
                    : `${visibleRows.length} active`}
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} />
              Show removed/inactive
            </label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visibleRows.length === 0 && !adminRow ? (
            <p className="p-6 text-sm text-muted-foreground">
              {showInactive ? "No removed agents." : "No agents yet. Add one above."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Tasks</TableHead>
                  <TableHead className="text-center">Errors</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!showInactive && adminRow && (
                  <TableRow key={`admin-${adminRow.id}`}>
                    <TableCell className="font-medium">{adminRow.name}</TableCell>
                    <TableCell className="text-sm">{adminRow.email}</TableCell>
                    <TableCell>
                      <Badge>Admin</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>Active</Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">—</TableCell>
                    <TableCell className="text-center text-sm">
                      {errorCounts[adminRow.name.toLowerCase()] ?? 0}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {adminRow.created_at
                        ? new Date(adminRow.created_at).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      Protected
                    </TableCell>
                  </TableRow>
                )}
                {visibleRows.map((r) => {
                  const statusLabel =
                    !r.user_id && r.status === "pending"
                      ? "Pending Registration"
                      : r.status === "active"
                        ? "Active"
                        : "Inactive";
                  const variant = !r.user_id
                    ? "outline"
                    : r.status === "active"
                      ? "default"
                      : "secondary";
                  const tasks = r.user_id ? (taskCounts[r.user_id] ?? 0) : 0;
                  const errs = errorCounts[r.name.toLowerCase()] ?? 0;
                  return (
                    <TableRow key={`${r.isInvite ? "i" : "u"}-${r.id}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">Agent</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={variant as never}>{statusLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">{tasks}</TableCell>
                      <TableCell className="text-center text-sm">{errs}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          {r.isInvite && (
                            <Select
                              value={r.status}
                              onValueChange={async (v) => {
                                const res = await setStatus(r.id, v as AgentInviteStatus);
                                if (!res.ok) toast.error(res.error);
                                else toast.success("Status updated");
                              }}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="inactive">Inactive</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          {r.isInvite && !r.user_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Resend invite"
                              onClick={() => resendInvite(r)}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            title="View tasks & errors"
                            onClick={() =>
                              setViewing({ id: r.user_id, name: r.name, email: r.email })
                            }
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {r.user_id && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Edit agent"
                                onClick={() =>
                                  setEditTarget({
                                    userId: r.user_id!,
                                    name: r.name,
                                    email: r.email,
                                    role: "agent",
                                    active: r.status !== "inactive",
                                  })
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Reset password"
                                onClick={() => {
                                  setPwTarget({ userId: r.user_id!, name: r.name });
                                  setPwValue("");
                                }}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {r.status === "inactive" && r.user_id ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Reactivate agent"
                              onClick={async () => {
                                const res = await reactivate(r.user_id!);
                                if (!res.ok) toast.error(res.error);
                                else toast.success(`${r.name} reactivated`);
                              }}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Remove agent"
                              className="text-destructive hover:text-destructive"
                              onClick={() =>
                                setConfirmDelete({
                                  userId: r.user_id,
                                  inviteId: r.isInvite ? r.id : null,
                                  name: r.name,
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          {r.status === "inactive" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Permanently delete agent & all data"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setPurgeTarget({ name: r.name })}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="ml-1 text-xs">Purge</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <AgentDetailDrawer
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        agent={viewing}
      />
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will lose login access immediately. Their previously reported defects and audit
              history remain available for reports and Excel exports. You can re-invite them later
              from this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!pwTarget}
        onOpenChange={(o) => {
          if (!o) {
            setPwTarget(null);
            setPwValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password — {pwTarget?.name}</DialogTitle>
            <DialogDescription>
              The new password is stored securely (hashed). Share it with the agent over a secure
              channel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New password</Label>
            <Input
              type="text"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPwTarget(null);
                setPwValue("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={submitPasswordReset} disabled={pwSaving}>
              {pwSaving ? "Saving…" : "Save password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit agent</DialogTitle>
            <DialogDescription>Update name, email, role, or active status.</DialogDescription>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input
                  value={editTarget.name}
                  onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editTarget.email}
                  onChange={(e) => setEditTarget({ ...editTarget, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select
                  value={editTarget.role}
                  onValueChange={(v) =>
                    setEditTarget({ ...editTarget, role: v as "admin" | "agent" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agent">QA Agent</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editTarget.active}
                  onCheckedChange={(v) => setEditTarget({ ...editTarget, active: v })}
                />
                <Label className="!mt-0">Active (login enabled)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={editSaving}>
              {editSaving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!purgeTarget} onOpenChange={(o) => !o && setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {purgeTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This removes every record tied to <strong>{purgeTarget?.name}</strong> across the
                  system. It cannot be undone.
                </p>
                {purgeLoading && (
                  <p className="text-sm text-muted-foreground">Counting related records…</p>
                )}
                {purgePreview && (
                  <ul className="rounded-md border bg-muted/40 p-3 text-sm">
                    <li>
                      Defects deleted: <strong>{purgePreview.defects}</strong>
                    </li>
                    <li>
                      Retest assignments deleted: <strong>{purgePreview.retest_assignments}</strong>
                    </li>
                    <li>
                      Notifications deleted: <strong>{purgePreview.notifications}</strong>
                    </li>
                    <li>
                      Forms cleared (assignee blanked):{" "}
                      <strong>{purgePreview.forms_cleared}</strong>
                    </li>
                    <li>
                      Pending retest invites removed:{" "}
                      <strong>{purgePreview.pending_retests}</strong>
                    </li>
                    <li className="mt-1 border-t pt-1">
                      Total rows affected: <strong>{purgePreview.total}</strong>
                    </li>
                  </ul>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={purgeRunning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPermanentDelete}
              disabled={purgeRunning || purgeLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {purgeRunning ? "Purging…" : "Permanently delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
