import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DefectStatusBadge, PriorityBadge } from "@/components/qa/StatusBadge";
import { DefectDetailSheet } from "@/components/qa/DefectDetailSheet";
import { ExportMenu } from "@/components/qa/ExportMenu";
import { Eye, Search, ShieldCheck, ShieldX } from "lucide-react";

export const Route = createFileRoute("/_app/my-errors")({
  component: MyErrorsPage,
});

function MyErrorsPage() {
  const { defects, currentUser } = useQA();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const mine = useMemo(() => {
    const me = currentUser?.name ?? "";
    const term = q.trim().toLowerCase();
    return defects.filter((d) => {
      if (d.assignedAgent !== me && d.createdBy !== me) return false;
      if (!term) return true;
      return [d.id, d.title, d.formFeature, d.module, d.status].join(" ").toLowerCase().includes(term);
    });
  }, [defects, currentUser, q]);

  const reported = mine.filter((d) => d.createdBy === currentUser?.name);
  const assigned = mine.filter((d) => d.assignedAgent === currentUser?.name);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Error Sheet</h2>
          <p className="text-sm text-muted-foreground">
            Errors you reported and defects assigned to you. {reported.length} reported · {assigned.length} assigned.
          </p>
        </div>
        <ExportMenu
          filename="my-errors"
          title="My errors export"
          filters={{ Agent: currentUser?.name ?? "—", Count: mine.length }}
          rows={mine.map(({ comments, ...d }) => ({ ...d, commentsCount: comments.length }))}
          columns={["id","module","formFeature","title","status","priority","severity","validity","assignedAgent","createdBy","updatedAt"]}
          defaultSelected={["id","module","formFeature","title","status","priority","validity","updatedAt"]}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search my errors…" className="pl-9" />
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
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mine.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => setOpenId(d.id)}>
                  <TableCell className="font-mono text-xs">{d.id}</TableCell>
                  <TableCell className="text-sm">{d.module}</TableCell>
                  <TableCell className="text-sm">{d.formFeature}</TableCell>
                  <TableCell className="max-w-[280px] truncate font-medium">{d.title}</TableCell>
                  <TableCell><DefectStatusBadge status={d.status} /></TableCell>
                  <TableCell><PriorityBadge value={d.priority} /></TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                      {d.validity === "Valid" && <ShieldCheck className="h-3 w-3 text-success" />}
                      {d.validity === "Invalid" && <ShieldX className="h-3 w-3 text-destructive" />}
                      {d.validity ?? "Unverified"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(d.updatedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpenId(d.id); }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {mine.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
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
        onOpenChange={(o) => { if (!o) setOpenId(null); }}
      />
    </div>
  );
}