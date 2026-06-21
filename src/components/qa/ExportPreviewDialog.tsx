import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Loader2, AlertTriangle, RotateCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  createExportJob,
  getExportDownloadUrl,
  retryExportJob,
  type ExportFilters,
} from "@/lib/qa/exportJobs.functions";
import { toReportedErrorRow, REPORTED_ERROR_HEADERS } from "@/lib/qa/exportReportedErrors";
import { useExportJob } from "@/lib/qa/useExportJob";
import type { Defect, Environment } from "@/lib/qa/types";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: Defect[];
  filters: ExportFilters;
  environment: Environment | null;
  isAdmin: boolean;
};

export function ExportPreviewDialog({
  open,
  onOpenChange,
  rows,
  filters,
  environment,
  isAdmin,
}: Props) {
  const create = useServerFn(createExportJob);
  const sign = useServerFn(getExportDownloadUrl);
  const retry = useServerFn(retryExportJob);

  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const job = useExportJob(jobId);

  useEffect(() => {
    if (!open) {
      setJobId(null);
      setStarting(false);
      setDownloaded(false);
    }
  }, [open]);

  const preview = rows.slice(0, 10).map((d) => toReportedErrorRow(d));

  const startJob = async () => {
    setStarting(true);
    try {
      const res = await create({ data: { filters } });
      setJobId(res.jobId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start export");
    } finally {
      setStarting(false);
    }
  };

  const download = async () => {
    if (!jobId) return;
    try {
      const res = await sign({ data: { jobId } });
      const a = document.createElement("a");
      a.href = res.url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setDownloaded(true);
      toast.success(`Downloaded ${res.filename}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  const onRetry = async () => {
    if (!jobId) return;
    try {
      await retry({ data: { jobId } });
      toast.success("Retry started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  };

  const chips: { k: string; v: string }[] = [];
  if (environment) chips.push({ k: "Environment", v: environment });
  else chips.push({ k: "Environment", v: "All" });
  (Object.keys(filters) as (keyof ExportFilters)[]).forEach((k) => {
    const v = filters[k];
    if (k === "environment") return;
    if (typeof v === "string" && v && v !== "all") chips.push({ k: String(k), v });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Export Reported Errors</DialogTitle>
          <DialogDescription>
            Review what will be exported, then run it as a background job. You'll be able to
            download the file once it completes.
          </DialogDescription>
        </DialogHeader>

        {!jobId && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {chips.map((c) => (
                <Badge key={c.k} variant="secondary">
                  {c.k}: {c.v}
                </Badge>
              ))}
              <Badge>
                {rows.length} row{rows.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="rounded-md border">
              <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium">
                Columns ({REPORTED_ERROR_HEADERS.length}): {REPORTED_ERROR_HEADERS.join(", ")}
              </div>
              <div className="max-h-[300px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Date Reported</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{r.agent}</TableCell>
                        <TableCell className="text-xs">{r.section}</TableCell>
                        <TableCell className="max-w-[280px] truncate text-xs">
                          {r.description}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.reportedAt ? new Date(r.reportedAt).toLocaleString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {preview.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-6 text-center text-xs text-muted-foreground"
                        >
                          No rows match the current filters.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {rows.length > preview.length && (
                <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                  Showing first {preview.length} of {rows.length} rows.
                </div>
              )}
            </div>
          </div>
        )}

        {jobId && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <div className="font-medium">
                  Job status: <span className="capitalize">{job?.status ?? "pending"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {job?.row_count ?? 0} rows • job {jobId.slice(0, 8)}
                </div>
              </div>
              {job?.status === "processing" && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <Progress value={job?.progress ?? 0} />
            {job?.status === "failed" && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>{job.error ?? "Export failed"}</div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!jobId && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={startJob} disabled={starting || rows.length === 0}>
                {starting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Run as background job
              </Button>
            </>
          )}
          {jobId && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {job?.status === "failed" && isAdmin && (
                <Button variant="secondary" onClick={onRetry}>
                  <RotateCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              )}
              <Button onClick={download} disabled={job?.status !== "completed"}>
                <Download className="mr-2 h-4 w-4" />
                {downloaded ? "Download again" : "Download"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
