import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Download, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/auth-events")({
  component: AuthEventsPage,
});

type Row = {
  id: string;
  occurred_at: string;
  action: string;
  result: string;
  actor_email: string | null;
  summary: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: { reason?: string } | null;
};

const ACTION_OPTIONS = [
  { value: "all", label: "All events" },
  { value: "auth.login_success", label: "Login success" },
  { value: "auth.login_failure", label: "Login failure" },
  { value: "auth.signup_success", label: "Signup success" },
  { value: "auth.signup_failure", label: "Signup failure" },
  { value: "auth.leaked_password_blocked", label: "Leaked password blocked" },
  { value: "auth.password_reset_requested", label: "Password reset" },
  { value: "auth.logout", label: "Logout" },
] as const;

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function AuthEventsPage() {
  const { currentUser } = useQA();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [action, setAction] = useState<string>("all");
  const [days, setDays] = useState<string>("7");

  const load = async () => {
    setLoading(true);
    try {
      const since = new Date(
        Date.now() - Math.max(1, Number(days) || 7) * 86_400_000,
      ).toISOString();
      let q = supabase
        .from("activity_log")
        .select(
          "id, occurred_at, action, result, actor_email, summary, ip_address, user_agent, metadata",
        )
        .eq("category", "auth")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(1000);
      if (action !== "all") q = q.eq("action", action);
      if (email.trim()) q = q.ilike("actor_email", `%${email.trim().toLowerCase()}%`);
      const { data, error } = await q;
      if (error) throw error;
      setRows((data ?? []) as Row[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load auth events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === "admin") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.role]);

  const exportCsv = () => {
    const header = [
      "occurred_at",
      "action",
      "result",
      "email",
      "reason",
      "summary",
      "ip",
      "user_agent",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.occurred_at,
          r.action,
          r.result,
          r.actor_email,
          r.metadata?.reason,
          r.summary,
          r.ip_address,
          r.user_agent,
        ]
          .map(csvCell)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auth-events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const counts = useMemo(() => {
    const c = { success: 0, failure: 0, hibp: 0 } as Record<string, number>;
    for (const r of rows) {
      if (r.action === "auth.leaked_password_blocked") c.hibp++;
      if (r.result === "success") c.success++;
      else c.failure++;
    }
    return c;
  }, [rows]);

  if (!currentUser) return null;
  if (currentUser.role !== "admin") return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldAlert className="h-6 w-6 text-primary" /> Auth Events
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign-in, sign-up, password reset and leaked-password block attempts.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            {counts.success} success · {counts.failure} failure · {counts.hibp} leaked-password blocked
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_140px_auto_auto]">
          <Input
            placeholder="Filter by email contains…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={load} disabled={loading} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Apply
          </Button>
          <Button onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    {loading ? "Loading…" : "No auth events for the selected filters."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {new Date(r.occurred_at).toLocaleString()}
                    </TableCell>
                    <TableCell>{r.action.replace(/^auth\./, "")}</TableCell>
                    <TableCell>{r.actor_email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.result === "success" ? "secondary" : "destructive"}>
                        {r.result}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[420px] truncate text-xs text-muted-foreground" title={r.metadata?.reason ?? ""}>
                      {r.metadata?.reason ?? r.summary ?? ""}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}