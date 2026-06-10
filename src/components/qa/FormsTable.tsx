import { useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { TestStatusBadge } from "./StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, Eye } from "lucide-react";
import type { Module } from "@/lib/qa/types";

export function FormsTable({ module, title, description }: { module: Module; title: string; description: string }) {
  const { forms } = useQA();
  const [q, setQ] = useState("");
  const data = useMemo(
    () => forms.filter((f) => f.module === module && (q ? f.name.toLowerCase().includes(q.toLowerCase()) : true)),
    [forms, module, q],
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search forms…" className="w-64 pl-9" />
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Passed</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Open Defects</TableHead>
                <TableHead>Last Tested</TableHead>
                <TableHead>Assigned Agent</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell><TestStatusBadge status={f.status} /></TableCell>
                  <TableCell className="text-right text-success font-medium">{f.passed}</TableCell>
                  <TableCell className="text-right text-destructive font-medium">{f.failed}</TableCell>
                  <TableCell className="text-right">{f.openDefects}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(f.lastTested).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{f.assignedAgent}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost"><Eye className="h-4 w-4 mr-1" />View</Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No forms match your search.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
