import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getExportDownloadUrl, retryExportJob } from "@/lib/qa/exportJobs.functions";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

type Row = Database["public"]["Tables"]["export_jobs"]["Row"];

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "completed") return "default";
  if (s === "failed") return "destructive";
  if (s === "processing") return "secondary";
  return "outline";
}

export function ExportJobsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [jobs, setJobs] = useState<Row[]>([]);
  const sign = useServerFn(getExportDownloadUrl);
  const retry = useServerFn(retryExportJob);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      supabase
        .from("export_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(25)
        .then(({ data }) => {
          if (!cancelled && data) setJobs(data as Row[]);
        });
    load();
    const ch = supabase
      .channel(`export-jobs-panel-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "export_jobs" }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  const download = async (id: string) => {
    try {
      const res = await sign({ data: { jobId: id } });
      const a = document.createElement("a");
      a.href = res.url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  const onRetry = async (id: string) => {
    try {
      await retry({ data: { jobId: id } });
      toast.success("Retry started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export jobs</CardTitle>
        <CardDescription>Recent background exports with live progress.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Requested by</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Env</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[160px]">Progress</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead>Started</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="text-sm">
                  {j.requested_by_name}
                  <div className="text-xs text-muted-foreground capitalize">{j.role}</div>
                </TableCell>
                <TableCell className="text-xs">{j.scope}</TableCell>
                <TableCell className="text-xs">{j.environment ?? "All"}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(j.status)} className="capitalize">
                    {j.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Progress value={j.progress ?? 0} />
                </TableCell>
                <TableCell className="text-right text-sm">{j.row_count}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(j.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {j.status === "completed" && (
                      <Button size="sm" variant="outline" onClick={() => download(j.id)}>
                        <Download className="mr-1 h-3 w-3" />
                        Download
                      </Button>
                    )}
                    {j.status === "failed" && isAdmin && (
                      <Button size="sm" variant="secondary" onClick={() => onRetry(j.id)}>
                        <RotateCw className="mr-1 h-3 w-3" />
                        Retry
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  No export jobs yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
