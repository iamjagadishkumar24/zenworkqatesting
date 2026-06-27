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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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
  metadata: Record<string, unknown> | null;
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
  const [minutes, setMinutes] = useState<string>("10080"); // 7d
  const [metaIp, setMetaIp] = useState("");
  const [metaUa, setMetaUa] = useState("");
  const [metaDevice, setMetaDevice] = useState("");
  const [metaFailure, setMetaFailure] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [detailSearch, setDetailSearch] = useState("");

  useEffect(() => {
    setDetailSearch("");
  }, [selected?.id]);

  const load = async () => {
    setLoading(true);
    try {
      const since = new Date(
        Date.now() - Math.max(1, Number(minutes) || 10080) * 60_000,
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
  }, [currentUser?.role, minutes]);

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
    for (const r of filteredRows) {
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

  const filteredRows = useMemo(() => {
    const ipQ = metaIp.trim().toLowerCase();
    const uaQ = metaUa.trim().toLowerCase();
    const devQ = metaDevice.trim().toLowerCase();
    const failQ = metaFailure.trim().toLowerCase();
    if (!ipQ && !uaQ && !devQ && !failQ) return rows;
    const metaStr = (r: Row, key: string) => {
      const v = r.metadata && (r.metadata as Record<string, unknown>)[key];
      return typeof v === "string" ? v.toLowerCase() : "";
    };
    return rows.filter((r) => {
      if (ipQ) {
        const ip = (r.ip_address ?? "").toLowerCase() + " " + metaStr(r, "ip");
        if (!ip.includes(ipQ)) return false;
      }
      if (uaQ) {
        const ua = (r.user_agent ?? "").toLowerCase() + " " + metaStr(r, "user_agent");
        if (!ua.includes(uaQ)) return false;
      }
      if (devQ && !metaStr(r, "device").includes(devQ)) return false;
      if (failQ) {
        const reason = metaStr(r, "failure_reason") || metaStr(r, "reason");
        if (!reason.includes(failQ)) return false;
      }
      return true;
    });
  }, [rows, metaIp, metaUa, metaDevice, metaFailure]);

  const counts = useMemo(() => {
    const c = { success: 0, failure: 0, hibp: 0 } as Record<string, number>;
    for (const r of filteredRows) {
      if (r.action === "auth.leaked_password_blocked") c.hibp++;
      if (r.result === "success") c.success++;
      else c.failure++;
    }
    return c;
  }, [filteredRows]);

  if (!currentUser) return null;
  if (currentUser.role !== "admin") return <Navigate to="/dashboard" />;

  const reasonOf = (r: Row) =>
    (r.metadata && typeof r.metadata.reason === "string" ? (r.metadata.reason as string) : "") ||
    r.summary ||
    "";

  const highlight = (text: string, q: string) => {
    if (!q) return text;
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) ? (
        <mark
          key={i}
          className="rounded bg-yellow-300/70 px-0.5 text-foreground dark:bg-yellow-500/40"
        >
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  };

  const metadataJson = selected ? JSON.stringify(selected.metadata ?? {}, null, 2) : "";
  const matchCount = detailSearch
    ? (
        metadataJson.match(new RegExp(detailSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) ??
        []
      ).length
    : 0;

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
            {counts.success} success · {counts.failure} failure · {counts.hibp} leaked-password
            blocked
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_160px_auto_auto]">
            <Input
              placeholder="Filter by email contains…"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={minutes} onValueChange={setMinutes}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">Last 15 minutes</SelectItem>
                <SelectItem value="60">Last 1 hour</SelectItem>
                <SelectItem value="1440">Last 24 hours</SelectItem>
                <SelectItem value="10080">Last 7 days</SelectItem>
                <SelectItem value="43200">Last 30 days</SelectItem>
                <SelectItem value="129600">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={load} disabled={loading} variant="outline">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Apply
            </Button>
            <Button onClick={exportCsv} disabled={filteredRows.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Quick range:</span>
            {[
              { v: "15", label: "15m" },
              { v: "60", label: "1h" },
              { v: "1440", label: "24h" },
              { v: "10080", label: "7d" },
            ].map((p) => (
              <Button
                key={p.v}
                size="sm"
                variant={minutes === p.v ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setMinutes(p.v)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <Input
              placeholder="metadata.ip contains…"
              value={metaIp}
              onChange={(e) => setMetaIp(e.target.value)}
              className="h-9 text-xs"
            />
            <Input
              placeholder="metadata.user_agent contains…"
              value={metaUa}
              onChange={(e) => setMetaUa(e.target.value)}
              className="h-9 text-xs"
            />
            <Input
              placeholder="metadata.device contains…"
              value={metaDevice}
              onChange={(e) => setMetaDevice(e.target.value)}
              className="h-9 text-xs"
            />
            <Input
              placeholder="metadata.failure_reason contains…"
              value={metaFailure}
              onChange={(e) => setMetaFailure(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
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
              {filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    {loading ? "Loading…" : "No auth events for the selected filters."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelected(r)}
                  >
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
                    <TableCell
                      className="max-w-[420px] truncate text-xs text-muted-foreground"
                      title={reasonOf(r)}
                    >
                      {reasonOf(r)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-primary" />
                  {selected.action.replace(/^auth\./, "")}
                </SheetTitle>
                <SheetDescription>
                  Event ID <span className="font-mono">{selected.id}</span>
                </SheetDescription>
              </SheetHeader>
              <dl className="mt-6 grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">Occurred at</dt>
                <dd className="font-mono text-xs">
                  {new Date(selected.occurred_at).toLocaleString()}{" "}
                  <span className="text-muted-foreground">
                    ({new Date(selected.occurred_at).toISOString()})
                  </span>
                </dd>
                <dt className="text-muted-foreground">Action</dt>
                <dd>{selected.action}</dd>
                <dt className="text-muted-foreground">Result</dt>
                <dd>
                  <Badge variant={selected.result === "success" ? "secondary" : "destructive"}>
                    {selected.result}
                  </Badge>
                </dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd>{selected.actor_email ?? "—"}</dd>
                <dt className="text-muted-foreground">Reason</dt>
                <dd className="whitespace-pre-wrap break-words">{reasonOf(selected) || "—"}</dd>
                <dt className="text-muted-foreground">Summary</dt>
                <dd className="whitespace-pre-wrap break-words">{selected.summary ?? "—"}</dd>
                <dt className="text-muted-foreground">IP address</dt>
                <dd className="font-mono text-xs">{selected.ip_address ?? "—"}</dd>
                <dt className="text-muted-foreground">User agent</dt>
                <dd className="break-words text-xs">{selected.user_agent ?? "—"}</dd>
              </dl>
              <div className="mt-6">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Metadata</div>
                <div className="mb-2 flex items-center gap-2">
                  <Input
                    placeholder="Search metadata…"
                    value={detailSearch}
                    onChange={(e) => setDetailSearch(e.target.value)}
                    className="h-8 text-xs"
                  />
                  {detailSearch && (
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {matchCount} match{matchCount === 1 ? "" : "es"}
                    </span>
                  )}
                </div>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-xs">
                  {highlight(metadataJson, detailSearch)}
                </pre>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
