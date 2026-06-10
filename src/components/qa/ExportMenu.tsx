import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { exportCsv, exportXlsx, type ExportRow } from "@/lib/qa/export";

type Props = {
  filename: string;
  rows: ExportRow[];
  columns: string[];
  defaultSelected?: string[];
  filters?: Record<string, unknown>;
  title?: string;
  extraSheets?: { name: string; rows: ExportRow[]; columns?: string[] }[];
  label?: string;
};

export function ExportMenu({
  filename, rows, columns, defaultSelected, filters, title, extraSheets, label = "Export",
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(defaultSelected ?? columns);

  const toggle = (c: string) =>
    setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));

  const cols = columns.filter((c) => selected.includes(c));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />{label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Columns to include</p>
            <p className="text-xs text-muted-foreground">Applied filters are preserved in the export.</p>
          </div>
          <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-auto rounded-md border border-border p-2">
            {columns.map((c) => (
              <Label key={c} className="flex items-center gap-2 text-xs font-normal">
                <Checkbox checked={selected.includes(c)} onCheckedChange={() => toggle(c)} />
                {c}
              </Label>
            ))}
          </div>
          <div className="flex justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(columns)}>All</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>None</Button>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              size="sm" variant="outline"
              disabled={!cols.length}
              onClick={() => { exportCsv(filename, rows, cols); setOpen(false); }}
            ><FileText className="mr-1 h-4 w-4" />CSV</Button>
            <Button
              size="sm"
              disabled={!cols.length}
              onClick={() => {
                exportXlsx(filename, [{ name: "Data", rows, columns: cols }, ...(extraSheets ?? [])], { title, filters });
                setOpen(false);
              }}
            ><FileSpreadsheet className="mr-1 h-4 w-4" />Excel</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}