import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ReportsSubPageShell,
  validateSubSearch,
  type SubPageSearch,
} from "@/components/qa/ReportsSubPageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/reports/scheduled")({
  validateSearch: validateSubSearch,
  component: ScheduledPage,
});

type Schedule = { id: string; name: string; cron: string; recipients: string };

function ScheduledPage() {
  const search = Route.useSearch();
  const nav = useNavigate({ from: Route.fullPath });
  const patch = (p: Partial<SubPageSearch>) =>
    nav({ replace: true, search: (prev: SubPageSearch) => ({ ...prev, ...p }) });

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [draft, setDraft] = useState<Schedule>({
    id: "",
    name: "",
    cron: "0 8 * * 1",
    recipients: "",
  });

  const add = () => {
    if (!draft.name.trim()) {
      toast.error("Schedule name is required");
      return;
    }
    setSchedules((s) => [...s, { ...draft, id: crypto.randomUUID() }]);
    setDraft({ id: "", name: "", cron: "0 8 * * 1", recipients: "" });
    toast.success("Schedule added");
  };

  return (
    <ReportsSubPageShell
      title="Scheduled Reports"
      description="Define delivery cadence for recurring reports filtered by state and error type."
      search={search}
      onChange={patch}
    >
      <Card>
        <CardHeader>
          <CardTitle>Create schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Cron</Label>
            <Input
              value={draft.cron}
              onChange={(e) => setDraft({ ...draft, cron: e.target.value })}
            />
          </div>
          <div>
            <Label>Recipients</Label>
            <Input
              placeholder="comma,separated"
              value={draft.recipients}
              onChange={(e) => setDraft({ ...draft, recipients: e.target.value })}
            />
          </div>
          <div className="sm:col-span-4">
            <Button onClick={add}>Add schedule</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Active schedules</CardTitle>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No schedules defined yet.</p>
          ) : (
            <ul className="divide-y">
              {schedules.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.cron} • {s.recipients || "no recipients"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSchedules((all) => all.filter((x) => x.id !== s.id))
                    }
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </ReportsSubPageShell>
  );
}