import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQA } from "@/lib/qa/store";
import { usePrefs, type AdminPrefs } from "@/lib/qa/prefs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { exportCsv, exportXlsx } from "@/lib/qa/export";
import { useServerFn } from "@tanstack/react-start";
import { inviteAgent, resetSampleAdmin } from "@/lib/qa/admin.functions";
import {
  Users, Layers, FileText, Tag, BellRing, FileBarChart, Palette,
  LayoutDashboard, Database, History, ShieldCheck, Plus, X, Save, RotateCcw, Download,
  Mail, KeyRound, Copy,
} from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { currentUser, users, updateUser, forms, defects, audit, addForm, updateForm } = useQA();
  const { prefs, update, reset } = usePrefs();
  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Manage the QA portal — team, modules, taxonomy, notifications and more." : "Your profile and preferences."}
          </p>
        </div>
        {isAdmin && (
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> Admin mode
          </Badge>
        )}
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1">
          <TabsTrigger value="profile"><Users className="mr-1 h-3 w-3" />Profile</TabsTrigger>
          <TabsTrigger value="team" disabled={!isAdmin}><Users className="mr-1 h-3 w-3" />Team & Roles</TabsTrigger>
          <TabsTrigger value="modules" disabled={!isAdmin}><Layers className="mr-1 h-3 w-3" />Modules</TabsTrigger>
          <TabsTrigger value="forms" disabled={!isAdmin}><FileText className="mr-1 h-3 w-3" />Forms</TabsTrigger>
          <TabsTrigger value="taxonomy" disabled={!isAdmin}><Tag className="mr-1 h-3 w-3" />Statuses & Priorities</TabsTrigger>
          <TabsTrigger value="notifications"><BellRing className="mr-1 h-3 w-3" />Notifications</TabsTrigger>
          <TabsTrigger value="reports" disabled={!isAdmin}><FileBarChart className="mr-1 h-3 w-3" />Reports</TabsTrigger>
          <TabsTrigger value="theme"><Palette className="mr-1 h-3 w-3" />Theme</TabsTrigger>
          <TabsTrigger value="dashboard"><LayoutDashboard className="mr-1 h-3 w-3" />Dashboard</TabsTrigger>
          <TabsTrigger value="data" disabled={!isAdmin}><Database className="mr-1 h-3 w-3" />Import / Export</TabsTrigger>
          <TabsTrigger value="audit" disabled={!isAdmin}><History className="mr-1 h-3 w-3" />Audit Log</TabsTrigger>
        </TabsList>

        {/* PROFILE */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Your Profile</CardTitle>
              <CardDescription>Account details for the signed-in user.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div><Label>Name</Label><Input value={currentUser?.name ?? ""} disabled /></div>
              <div><Label>Email</Label><Input value={currentUser?.email ?? ""} disabled /></div>
              <div><Label>Role</Label><Input value={currentUser?.role ?? ""} disabled className="capitalize" /></div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TEAM */}
        <TabsContent value="team" className="space-y-4">
          <InviteAgentCard />
          <SampleAdminCard />
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Open defects</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const load = defects.filter((d) => d.assignedAgent === u.name && !["Fixed","Closed"].includes(d.status)).length;
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <TableRow key={u.id} className={u.active ? "" : "opacity-60"}>
                        <TableCell className="font-medium">
                          {u.name}
                          {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                        </TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            disabled={!u.active || isSelf}
                            onValueChange={async (v) => {
                              const r = await updateUser(u.id, { role: v as "admin" | "agent" });
                              if (!r.ok) toast.error(r.error); else toast.success("Role updated");
                            }}
                          >
                            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="agent">QA Agent</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {u.active ? (
                            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={u.active}
                            disabled={isSelf}
                            onCheckedChange={async (c) => {
                              const r = await updateUser(u.id, { active: c });
                              if (!r.ok) { toast.error(r.error); return; }
                              if (!c) {
                                await updateUser(u.id, { role: "agent" });
                                toast.success(`${u.name} deactivated — access revoked`);
                              } else {
                                toast.success(`${u.name} activated`);
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-right text-sm">{load}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MODULES */}
        <TabsContent value="modules">
          <ChipListCard
            title="QA Modules"
            description="Top-level product areas covered by the QA team. Used for filtering, KPI grouping and reports."
            items={prefs.modules}
            onChange={(items) => update("modules", items)}
          />
        </TabsContent>

        {/* FORMS */}
        <TabsContent value="forms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Forms & Features</CardTitle>
              <CardDescription>Tracked forms across all modules. Edit status, assign agents, or add a new form.</CardDescription>
            </CardHeader>
            <CardContent>
              <AddFormRow modules={prefs.modules} agents={users.map((u) => u.name)} onAdd={async (f) => {
                const r = await addForm(f as never);
                if (r.ok) toast.success("Form added"); else toast.error(r.error);
              }} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead className="text-right">Defects</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forms.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell>{f.module}</TableCell>
                      <TableCell>
                        <Select value={f.status} onValueChange={async (v) => {
                          const r = await updateForm(f.id, { status: v as never });
                          if (!r.ok) toast.error(r.error);
                        }}>
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["Passed","Failed","Open Bug","In Progress","Pending","Retest Required"].map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={f.assignedAgent} onValueChange={async (v) => {
                          const r = await updateForm(f.id, { assignedAgent: v });
                          if (!r.ok) toast.error(r.error);
                        }}>
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {users.map((u) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right text-sm">{f.openDefects}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAXONOMY */}
        <TabsContent value="taxonomy" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ChipListCard title="Defect Statuses" description="Lifecycle states applied to every defect." items={prefs.defectStatuses} onChange={(x) => update("defectStatuses", x)} />
            <ChipListCard title="Error Statuses" description="Validation states for reported errors." items={prefs.errorStatuses} onChange={(x) => update("errorStatuses", x)} />
            <ChipListCard title="Priorities" items={prefs.priorities} onChange={(x) => update("priorities", x)} />
            <ChipListCard title="Severities" items={prefs.severities} onChange={(x) => update("severities", x)} />
          </div>
        </TabsContent>

        {/* NOTIFICATIONS */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Choose how the team is alerted. Saved per browser for the demo; production wiring goes through your email/Slack connector.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow label="Email me when a defect is assigned" v={prefs.notifyOnAssignEmail} on={(c) => update("notifyOnAssignEmail", c)} />
              <ToggleRow label="Slack alert for Critical defects" v={prefs.notifyCriticalSlack} on={(c) => update("notifyCriticalSlack", c)} />
              <ToggleRow label="Notify when a defect is reopened" v={prefs.notifyOnReopen} on={(c) => update("notifyOnReopen", c)} />
              <ToggleRow label="Notify on new comments" v={prefs.notifyOnComment} on={(c) => update("notifyOnComment", c)} />
              <ToggleRow label="Weekly QA digest" v={prefs.notifyWeeklyDigest} on={(c) => update("notifyWeeklyDigest", c)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* REPORTS */}
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Report Settings</CardTitle>
              <CardDescription>Defaults applied when generating reports and exports.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Time zone</Label>
                <Input value={prefs.reportTimezone} onChange={(e) => update("reportTimezone", e.target.value)} />
              </div>
              <div>
                <Label>Week starts on</Label>
                <Select value={prefs.reportWeekStart} onValueChange={(v) => update("reportWeekStart", v as AdminPrefs["reportWeekStart"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monday">Monday</SelectItem>
                    <SelectItem value="sunday">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Default export format</Label>
                <Select value={prefs.defaultExportFormat} onValueChange={(v) => update("defaultExportFormat", v as AdminPrefs["defaultExportFormat"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ToggleRow className="md:col-span-2" label="Include comments in exports" v={prefs.includeCommentsInExport} on={(c) => update("includeCommentsInExport", c)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* THEME */}
        <TabsContent value="theme">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Appearance of the portal. Applied immediately.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Color mode</Label>
                <Select value={prefs.theme} onValueChange={(v) => update("theme", v as AdminPrefs["theme"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Accent</Label>
                <Select value={prefs.accent} onValueChange={(v) => update("accent", v as AdminPrefs["accent"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blue">Blue (default)</SelectItem>
                    <SelectItem value="violet">Violet</SelectItem>
                    <SelectItem value="emerald">Emerald</SelectItem>
                    <SelectItem value="rose">Rose</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Density</Label>
                <Select value={prefs.density} onValueChange={(v) => update("density", v as AdminPrefs["density"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DASHBOARD */}
        <TabsContent value="dashboard">
          <Card>
            <CardHeader>
              <CardTitle>Dashboard Preferences</CardTitle>
              <CardDescription>Choose your landing page and which widgets appear.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Default landing page after sign-in</Label>
                <Select value={prefs.defaultLanding} onValueChange={(v) => update("defaultLanding", v as AdminPrefs["defaultLanding"])}>
                  <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="/dashboard">Dashboard</SelectItem>
                    <SelectItem value="/defects">Defects</SelectItem>
                    <SelectItem value="/my-errors">My Errors</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ToggleRow label="Show KPI cards" v={prefs.showKpiCards} on={(c) => update("showKpiCards", c)} />
              <ToggleRow label="Show defect trend chart" v={prefs.showTrendChart} on={(c) => update("showTrendChart", c)} />
              <ToggleRow label="Show agent load chart" v={prefs.showAgentChart} on={(c) => update("showAgentChart", c)} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* IMPORT / EXPORT */}
        <TabsContent value="data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import / Export</CardTitle>
              <CardDescription>Bulk download every record or take a snapshot of your settings.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>CSV delimiter</Label>
                <Select value={prefs.csvDelimiter} onValueChange={(v) => update("csvDelimiter", v as AdminPrefs["csvDelimiter"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=",">Comma (,)</SelectItem>
                    <SelectItem value=";">Semicolon (;)</SelectItem>
                    <SelectItem value={"\t"}>Tab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Import merge strategy</Label>
                <Select value={prefs.importMergeStrategy} onValueChange={(v) => update("importMergeStrategy", v as AdminPrefs["importMergeStrategy"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip-existing">Skip existing rows</SelectItem>
                    <SelectItem value="overwrite">Overwrite existing rows</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => exportCsv("defects-all", defects.map(({ comments, ...d }) => ({ ...d, comments: comments.length })))}>
                  <Download className="mr-2 h-4 w-4" /> Export defects (CSV)
                </Button>
                <Button variant="outline" onClick={() => exportXlsx(
                  "qa-snapshot",
                  [
                    { name: "Defects", rows: defects.map(({ comments, ...d }) => ({ ...d, comments: comments.length })) },
                    { name: "Forms", rows: forms as unknown as Record<string, unknown>[] },
                    { name: "Users", rows: users.map(({ id: _id, ...u }) => u) },
                    { name: "Audit", rows: audit as unknown as Record<string, unknown>[] },
                  ],
                  { title: "QA portal snapshot" },
                )}>
                  <Download className="mr-2 h-4 w-4" /> Full snapshot (Excel)
                </Button>
                <Button variant="outline" onClick={() => exportCsv("settings", [prefs])}>
                  <Download className="mr-2 h-4 w-4" /> Export settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AUDIT */}
        <TabsContent value="audit">
          <AuditTable />
        </TabsContent>
      </Tabs>

      {isAdmin && (
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => { reset(); toast.success("Preferences reset"); }}>
            <RotateCcw className="mr-2 h-4 w-4" /> Reset preferences
          </Button>
          <Button onClick={() => toast.success("Preferences saved")}>
            <Save className="mr-2 h-4 w-4" /> Save
          </Button>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, v, on, className }: { label: string; v: boolean; on: (c: boolean) => void; className?: string }) {
  return (
    <div className={`flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 ${className ?? ""}`}>
      <Label className="cursor-pointer">{label}</Label>
      <Switch checked={v} onCheckedChange={on} />
    </div>
  );
}

function ChipListCard({
  title, description, items, onChange,
}: {
  title: string;
  description?: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [val, setVal] = useState("");
  const add = () => {
    const v = val.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setVal("");
  };
  const remove = (i: string) => onChange(items.filter((x) => x !== i));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {items.map((i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs">
              {i}
              <button onClick={() => remove(i)} aria-label={`Remove ${i}`} className="rounded-full hover:bg-destructive/10 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {items.length === 0 && <span className="text-xs text-muted-foreground">No items yet.</span>}
        </div>
        <div className="flex gap-2">
          <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Add new…" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Add</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddFormRow({
  modules, agents, onAdd,
}: {
  modules: string[];
  agents: string[];
  onAdd: (f: {
    name: string; module: string; status: string; passed: number; failed: number;
    openDefects: number; lastTested: string; assignedAgent: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [mod, setMod] = useState(modules[0] ?? "");
  const [agent, setAgent] = useState(agents[0] ?? "");
  return (
    <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Form name (e.g. 1099-NEC)" />
      <Select value={mod} onValueChange={setMod}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{modules.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={agent} onValueChange={setAgent}>
        <SelectTrigger><SelectValue placeholder="Assign agent" /></SelectTrigger>
        <SelectContent>{agents.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
      </Select>
      <Button onClick={() => {
        if (!name.trim()) { toast.error("Form name required"); return; }
        onAdd({
          name: name.trim(), module: mod, status: "Pending",
          passed: 0, failed: 0, openDefects: 0,
          lastTested: new Date().toISOString(), assignedAgent: agent,
        });
        setName("");
      }}>
        <Plus className="mr-1 h-4 w-4" /> Add form
      </Button>
    </div>
  );
}

function AuditTable() {
  const { audit, currentUser } = useQA();
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return audit.slice(0, 200);
    return audit.filter((a) =>
      [a.defectId, a.field, a.oldValue ?? "", a.newValue ?? "", a.changedBy].join(" ").toLowerCase().includes(term),
    ).slice(0, 200);
  }, [audit, q]);

  if (currentUser?.role !== "admin") {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Admin only.</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Audit Log</CardTitle>
          <CardDescription>Every defect status, priority, severity, assignment and validity change. {audit.length} entries.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Input className="w-60" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button variant="outline" onClick={() => exportCsv("audit-log", audit)}><Download className="mr-1 h-4 w-4" />Export</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Defect</TableHead>
              <TableHead>Field</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-xs text-muted-foreground">{new Date(a.changedAt).toLocaleString()}</TableCell>
                <TableCell className="font-mono text-xs">{a.defectId}</TableCell>
                <TableCell className="capitalize">{a.field.replace(/_/g, " ")}</TableCell>
                <TableCell><span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground line-through">{a.oldValue ?? "—"}</span></TableCell>
                <TableCell><span className="rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">{a.newValue ?? "—"}</span></TableCell>
                <TableCell className="text-sm">{a.changedBy}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No audit entries match.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
