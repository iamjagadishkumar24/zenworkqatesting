import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { History, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  clearPermissionAudit,
  getPermissionAudit,
  hydratePermissionAudit,
  subscribePermissionAudit,
  type PermissionAuditEntry,
} from "@/lib/qa/permissionAudit";

type Filter = "all" | "admin" | "agent";

export function PermissionAuditHistoryPage() {
  const [entries, setEntries] = useState<PermissionAuditEntry[]>(() =>
    getPermissionAudit(),
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    const unsub = subscribePermissionAudit(() => setEntries(getPermissionAudit()));
    setEntries(getPermissionAudit());
    void hydratePermissionAudit();
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== "all" && e.role !== filter) return false;
      if (!term) return true;
      return (
        e.userName.toLowerCase().includes(term) ||
        e.module.toLowerCase().includes(term) ||
        e.action.toLowerCase().includes(term)
      );
    });
  }, [entries, filter, q]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <History className="h-6 w-6 text-primary" />
            Permission Audit History
          </h2>
          <p className="text-sm text-muted-foreground">
            Every permission grant or revocation performed in Rights Management is
            recorded here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-[160px]" aria-label="Filter by user type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All user types</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search user, module, action…"
              className="w-72 pl-9"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              clearPermissionAudit();
              toast.success("Permission audit history cleared");
            }}
            disabled={entries.length === 0}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Clear
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
          </CardTitle>
          <CardDescription>
            Showing the most recent {entries.length} change
            {entries.length === 1 ? "" : "s"} (latest first).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(a.at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">{a.userName}</TableCell>
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
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {entries.length === 0
                      ? "No permission changes recorded yet."
                      : "No entries match the current filters."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_app/_admin/permission-audit")({
  component: PermissionAuditHistoryPage,
});