import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQA } from "@/lib/qa/store";
import { usePrefs, type AdminPrefs } from "@/lib/qa/prefs";

const AGENT_THEMES: { value: AdminPrefs["accent"]; label: string; swatch: string }[] = [
  { value: "light", label: "Light", swatch: "linear-gradient(135deg, oklch(0.96 0.01 255), oklch(0.88 0.02 255))" },
  { value: "blue", label: "Blue", swatch: "linear-gradient(135deg, oklch(0.55 0.2 255), oklch(0.7 0.18 255))" },
  { value: "green", label: "Green", swatch: "linear-gradient(135deg, oklch(0.6 0.17 155), oklch(0.72 0.15 160))" },
  { value: "emerald", label: "Emerald", swatch: "linear-gradient(135deg, oklch(0.62 0.16 155), oklch(0.76 0.14 160))" },
  { value: "teal", label: "Teal", swatch: "linear-gradient(135deg, oklch(0.62 0.13 195), oklch(0.74 0.12 195))" },
  { value: "purple", label: "Purple", swatch: "linear-gradient(135deg, oklch(0.55 0.22 295), oklch(0.68 0.2 295))" },
  { value: "violet", label: "Violet", swatch: "linear-gradient(135deg, oklch(0.58 0.22 295), oklch(0.72 0.2 295))" },
  { value: "pink", label: "Pink", swatch: "linear-gradient(135deg, oklch(0.68 0.2 350), oklch(0.78 0.18 350))" },
  { value: "rose", label: "Rose", swatch: "linear-gradient(135deg, oklch(0.65 0.2 15), oklch(0.78 0.18 15))" },
  { value: "orange", label: "Orange", swatch: "linear-gradient(135deg, oklch(0.66 0.18 55), oklch(0.78 0.16 60))" },
  { value: "grey", label: "Grey", swatch: "linear-gradient(135deg, oklch(0.5 0.02 255), oklch(0.62 0.02 255))" },
];
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { exportCsv, exportXlsx } from "@/lib/qa/export";
import { useServerFn } from "@tanstack/react-start";
import { inviteAgent, resetSampleAdmin } from "@/lib/qa/admin.functions";
import { setAllowAgentExports } from "@/lib/qa/exportJobs.functions";
import {
  getQARuntimeConfig,
  listQARuntimeConfigAudit,
  updateQARuntimeConfig,
  type QARuntimeConfigAuditEntry,
} from "@/lib/qa/runtime-config.functions";
import {
  getMyRuntimeAuditPageSize,
  setMyRuntimeAuditPageSize,
} from "@/lib/qa/userPreferences.functions";
import { ExportJobsPanel } from "@/components/qa/ExportJobsPanel";
import {
  Users,
  Layers,
  FileText,
  Tag,
  BellRing,
  FileBarChart,
  Palette,
  LayoutDashboard,
  Database,
  History,
  ShieldCheck,
  Plus,
  X,
  Save,
  RotateCcw,
  Download,
  Mail,
  KeyRound,
  Copy,
  Upload,
  Trash2,
} from "lucide-react";
import { Cpu } from "lucide-react";
import { UserAvatar } from "@/components/qa/UserAvatar";

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
            {isAdmin
              ? "Manage the QA portal — team, modules, taxonomy, notifications and more."
              : "Your profile and preferences."}
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
          <TabsTrigger value="profile">
            <Users className="mr-1 h-3 w-3" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="team" disabled={!isAdmin}>
            <Users className="mr-1 h-3 w-3" />
            Team & Roles
          </TabsTrigger>
          <TabsTrigger value="modules" disabled={!isAdmin}>
            <Layers className="mr-1 h-3 w-3" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="forms" disabled={!isAdmin}>
            <FileText className="mr-1 h-3 w-3" />
            Forms
          </TabsTrigger>
          <TabsTrigger value="taxonomy" disabled={!isAdmin}>
            <Tag className="mr-1 h-3 w-3" />
            Statuses & Priorities
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <BellRing className="mr-1 h-3 w-3" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="reports" disabled={!isAdmin}>
            <FileBarChart className="mr-1 h-3 w-3" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="theme">
            <Palette className="mr-1 h-3 w-3" />
            Theme
          </TabsTrigger>
          <TabsTrigger value="dashboard">
            <LayoutDashboard className="mr-1 h-3 w-3" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="data" disabled={!isAdmin}>
            <Database className="mr-1 h-3 w-3" />
            Import / Export
          </TabsTrigger>
          <TabsTrigger value="audit" disabled={!isAdmin}>
            <History className="mr-1 h-3 w-3" />
            Audit Log
          </TabsTrigger>
          <TabsTrigger value="runtime" disabled={!isAdmin}>
            <Cpu className="mr-1 h-3 w-3" />
            Runtime
          </TabsTrigger>
        </TabsList>

        {/* PROFILE */}
        <TabsContent value="profile">
          <ProfilePictureCard />
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
                    const load = defects.filter(
                      (d) => d.assignedAgent === u.name && !["Fixed", "Closed"].includes(d.status),
                    ).length;
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <TableRow key={u.id} className={u.active ? "" : "opacity-60"}>
                        <TableCell className="font-medium">
                          {u.name}
                          {isSelf && (
                            <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                          )}
                        </TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Select
                            value={u.role}
                            disabled={!u.active || isSelf}
                            onValueChange={async (v) => {
                              const r = await updateUser(u.id, { role: v as "admin" | "agent" });
                              if (!r.ok) toast.error(r.error);
                              else toast.success("Role updated");
                            }}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="agent">QA Agent</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {u.active ? (
                            <Badge
                              variant="secondary"
                              className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            >
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
                              if (!r.ok) {
                                toast.error(r.error);
                                return;
                              }
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
              <CardDescription>
                Tracked forms across all modules. Edit status, assign agents, or add a new form.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddFormRow
                modules={prefs.modules}
                agents={users.map((u) => u.name)}
                onAdd={async (f) => {
                  const r = await addForm(f as never);
                  if (r.ok) toast.success("Form added");
                  else toast.error(r.error);
                }}
              />
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
                        <Select
                          value={f.status}
                          onValueChange={async (v) => {
                            const r = await updateForm(f.id, { status: v as never });
                            if (!r.ok) toast.error(r.error);
                          }}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[
                              "Passed",
                              "Failed",
                              "Open Bug",
                              "In Progress",
                              "Pending",
                              "Retest Required",
                            ].map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={f.assignedAgent}
                          onValueChange={async (v) => {
                            const r = await updateForm(f.id, { assignedAgent: v });
                            if (!r.ok) toast.error(r.error);
                          }}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={u.name}>
                                {u.name}
                              </SelectItem>
                            ))}
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
            <ChipListCard
              title="Defect Statuses"
              description="Lifecycle states applied to every defect."
              items={prefs.defectStatuses}
              onChange={(x) => update("defectStatuses", x)}
            />
            <ChipListCard
              title="Error Statuses"
              description="Validation states for reported errors."
              items={prefs.errorStatuses}
              onChange={(x) => update("errorStatuses", x)}
            />
            <ChipListCard
              title="Priorities"
              items={prefs.priorities}
              onChange={(x) => update("priorities", x)}
            />
            <ChipListCard
              title="Severities"
              items={prefs.severities}
              onChange={(x) => update("severities", x)}
            />
          </div>
        </TabsContent>

        {/* NOTIFICATIONS */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Choose how the team is alerted. Saved per browser for the demo; production wiring
                goes through your email/Slack connector.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleRow
                label="Email me when a defect is assigned"
                v={prefs.notifyOnAssignEmail}
                on={(c) => update("notifyOnAssignEmail", c)}
              />
              <ToggleRow
                label="Slack alert for Critical defects"
                v={prefs.notifyCriticalSlack}
                on={(c) => update("notifyCriticalSlack", c)}
              />
              <ToggleRow
                label="Notify when a defect is reopened"
                v={prefs.notifyOnReopen}
                on={(c) => update("notifyOnReopen", c)}
              />
              <ToggleRow
                label="Notify on new comments"
                v={prefs.notifyOnComment}
                on={(c) => update("notifyOnComment", c)}
              />
              <ToggleRow
                label="Weekly QA digest"
                v={prefs.notifyWeeklyDigest}
                on={(c) => update("notifyWeeklyDigest", c)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* REPORTS */}
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Report Settings</CardTitle>
              <CardDescription>
                Defaults applied when generating reports and exports.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Time zone</Label>
                <Input
                  value={prefs.reportTimezone}
                  onChange={(e) => update("reportTimezone", e.target.value)}
                />
              </div>
              <div>
                <Label>Week starts on</Label>
                <Select
                  value={prefs.reportWeekStart}
                  onValueChange={(v) =>
                    update("reportWeekStart", v as AdminPrefs["reportWeekStart"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monday">Monday</SelectItem>
                    <SelectItem value="sunday">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Default export format</Label>
                <Select
                  value={prefs.defaultExportFormat}
                  onValueChange={(v) =>
                    update("defaultExportFormat", v as AdminPrefs["defaultExportFormat"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ToggleRow
                className="md:col-span-2"
                label="Include comments in exports"
                v={prefs.includeCommentsInExport}
                on={(c) => update("includeCommentsInExport", c)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* THEME — Admins get full controls; agents are restricted to Light. */}
        <TabsContent value="theme">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>
                {isAdmin
                  ? "Appearance of the portal. Applied immediately."
                  : "Agents are restricted to the Light theme. Contact an admin for other options."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isAdmin ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Color mode</Label>
                      <Select
                        value={prefs.theme}
                        onValueChange={(v) => update("theme", v as AdminPrefs["theme"])}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Density</Label>
                      <Select
                        value={prefs.density}
                        onValueChange={(v) => update("density", v as AdminPrefs["density"])}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="comfortable">Comfortable</SelectItem>
                          <SelectItem value="compact">Compact</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <Label className="mb-3 block">Theme Colors</Label>
                  <div
                    role="radiogroup"
                    aria-label="Theme color"
                    className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                  >
                    {AGENT_THEMES.map((t) => {
                      const active = (prefs.accent ?? "light") === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={`${t.label} theme`}
                          onClick={() => update("accent", t.value as AdminPrefs["accent"])}
                          className={
                            "group flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-all hover:border-primary " +
                            (active ? "border-primary ring-2 ring-primary/40" : "border-border")
                          }
                        >
                          <span
                            className="h-10 w-full rounded-md"
                            style={{ background: t.swatch }}
                          />
                          <span className="text-sm font-medium">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
                <Select
                  value={prefs.defaultLanding}
                  onValueChange={(v) => update("defaultLanding", v as AdminPrefs["defaultLanding"])}
                >
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="/dashboard">Dashboard</SelectItem>
                    <SelectItem value="/my-reported-errors">Reported Errors</SelectItem>
                    <SelectItem value="/my-errors">My Errors</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <ToggleRow
                label="Show KPI cards"
                v={prefs.showKpiCards}
                on={(c) => update("showKpiCards", c)}
              />
              <ToggleRow
                label="Show defect trend chart"
                v={prefs.showTrendChart}
                on={(c) => update("showTrendChart", c)}
              />
              <ToggleRow
                label="Show agent load chart"
                v={prefs.showAgentChart}
                on={(c) => update("showAgentChart", c)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* IMPORT / EXPORT */}
        <TabsContent value="data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Import / Export</CardTitle>
              <CardDescription>
                Bulk download every record or take a snapshot of your settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>CSV delimiter</Label>
                <Select
                  value={prefs.csvDelimiter}
                  onValueChange={(v) => update("csvDelimiter", v as AdminPrefs["csvDelimiter"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=",">Comma (,)</SelectItem>
                    <SelectItem value=";">Semicolon (;)</SelectItem>
                    <SelectItem value={"\t"}>Tab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Import merge strategy</Label>
                <Select
                  value={prefs.importMergeStrategy}
                  onValueChange={(v) =>
                    update("importMergeStrategy", v as AdminPrefs["importMergeStrategy"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip-existing">Skip existing rows</SelectItem>
                    <SelectItem value="overwrite">Overwrite existing rows</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    exportCsv(
                      "defects-all",
                      defects.map(({ comments, ...d }) => ({ ...d, comments: comments.length })),
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" /> Export defects (CSV)
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    exportXlsx(
                      "qa-snapshot",
                      [
                        {
                          name: "Defects",
                          rows: defects.map(({ comments, ...d }) => ({
                            ...d,
                            comments: comments.length,
                          })),
                        },
                        { name: "Forms", rows: forms as unknown as Record<string, unknown>[] },
                        { name: "Users", rows: users.map(({ id: _id, ...u }) => u) },
                        { name: "Audit", rows: audit as unknown as Record<string, unknown>[] },
                      ],
                      { title: "QA portal snapshot" },
                    )
                  }
                >
                  <Download className="mr-2 h-4 w-4" /> Full snapshot (Excel)
                </Button>
                <Button variant="outline" onClick={() => exportCsv("settings", [prefs])}>
                  <Download className="mr-2 h-4 w-4" /> Export settings
                </Button>
              </div>
              {isAdmin && <AgentExportToggle />}
            </CardContent>
          </Card>
          {isAdmin && <ExportJobsPanel isAdmin={isAdmin} />}
        </TabsContent>

        {/* AUDIT */}
        <TabsContent value="audit">
          <div className="space-y-4">
            <AuditTable />
            <RoleAuditTable />
            <ExportAuditTable />
          </div>
        </TabsContent>

        {/* RUNTIME (admin) */}
        <TabsContent value="runtime">
          {isAdmin ? (
            <div className="space-y-4">
              <RuntimeConfigCard />
              <RuntimeConfigAuditCard />
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      {isAdmin && (
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              toast.success("Preferences reset");
            }}
          >
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

function AgentExportToggle() {
  const setAllow = useServerFn(setAllowAgentExports);
  const [allowed, setAllowedState] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "allow_agent_exports")
      .maybeSingle()
      .then(({ data }) => setAllowedState(data?.value === true));
  }, []);
  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      await setAllow({ data: { allowed: v } });
      setAllowedState(v);
      toast.success(`Agent exports ${v ? "enabled" : "disabled"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update setting");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="md:col-span-2 flex items-center justify-between rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium">Allow agents to export their own reported errors</p>
        <p className="text-xs text-muted-foreground">
          When disabled, only admins can export. Enforced in both UI and API.
        </p>
      </div>
      <Switch checked={allowed} onCheckedChange={toggle} disabled={busy} />
    </div>
  );
}

function RuntimeConfigCard() {
  const fetchCfg = useServerFn(getQARuntimeConfig);
  const saveCfg = useServerFn(updateQARuntimeConfig);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "live" | "perf">(null);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCfg()
      .then((cfg) => {
        if (cancelled) return;
        setLiveEnabled(cfg.liveEnabled);
        setPerformanceMode(cfg.performanceMode);
        setUpdatedAt(cfg.updatedAt ?? null);
      })
      .catch(() => toast.error("Failed to load runtime config"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchCfg]);

  const apply = async (next: { liveEnabled: boolean; performanceMode: boolean }, which: "live" | "perf") => {
    setBusy(which);
    try {
      const cfg = await saveCfg({ data: next });
      setLiveEnabled(cfg.liveEnabled);
      setPerformanceMode(cfg.performanceMode);
      setUpdatedAt(cfg.updatedAt ?? new Date().toISOString());
      toast.success("Runtime config updated", {
        description: "New settings take effect on next page load for connected clients.",
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("qa-runtime-config-updated"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update runtime config");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="h-4 w-4" /> Runtime Execution
        </CardTitle>
        <CardDescription>
          Toggle live realtime execution and the performance throttle for all clients without
          redeploying. Changes apply on the next page load.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current effective values
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Live execution</dt>
              <dd>
                <Badge variant={liveEnabled ? "default" : "secondary"}>
                  {loading ? "…" : liveEnabled ? "On" : "Off"}
                </Badge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-muted-foreground">Performance mode</dt>
              <dd>
                <Badge variant={performanceMode ? "default" : "secondary"}>
                  {loading ? "…" : performanceMode ? "On" : "Off"}
                </Badge>
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Last updated:{" "}
            {loading
              ? "loading…"
              : updatedAt
                ? new Date(updatedAt).toLocaleString()
                : "never"}
          </p>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">Live execution</p>
            <p className="text-xs text-muted-foreground">
              When off, the QA store skips opening the realtime channel entirely.
            </p>
          </div>
          <Switch
            checked={liveEnabled}
            disabled={loading || busy !== null}
            onCheckedChange={(v) => apply({ liveEnabled: v, performanceMode }, "live")}
            aria-label="Toggle live execution"
          />
        </div>
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <div>
            <p className="text-sm font-medium">Performance mode</p>
            <p className="text-xs text-muted-foreground">
              Batches realtime-driven state updates into a single frame to keep the UI smooth
              under heavy event load.
            </p>
          </div>
          <Switch
            checked={performanceMode}
            disabled={loading || busy !== null}
            onCheckedChange={(v) => apply({ liveEnabled, performanceMode: v }, "perf")}
            aria-label="Toggle performance mode"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function RuntimeConfigAuditCard() {
  const fetchAudit = useServerFn(listQARuntimeConfigAudit);
  const fetchPageSize = useServerFn(getMyRuntimeAuditPageSize);
  const savePageSize = useServerFn(setMyRuntimeAuditPageSize);
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
  const DEFAULT_PAGE_SIZE = 25;
  const isValidPageSize = (n: unknown): n is (typeof PAGE_SIZE_OPTIONS)[number] =>
    typeof n === "number" && (PAGE_SIZE_OPTIONS as readonly number[]).includes(n);
  const [entries, setEntries] = useState<QARuntimeConfigAuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSizeState] = useState<number>(DEFAULT_PAGE_SIZE);
  const [pageSizeReady, setPageSizeReady] = useState(false);

  useEffect(() => {
    fetchPageSize()
      .then((n) => setPageSizeState(isValidPageSize(n) ? n : DEFAULT_PAGE_SIZE))
      .catch(() => {
        setPageSizeState(DEFAULT_PAGE_SIZE);
        toast.message("Using default page size", {
          description: "Could not load your saved preference.",
        });
      })
      .finally(() => setPageSizeReady(true));
  }, [fetchPageSize]);

  const setPageSize = (n: number) => {
    const safe = isValidPageSize(n) ? n : DEFAULT_PAGE_SIZE;
    const previous = pageSize;
    setPageSizeState(safe);
    savePageSize({ data: { pageSize: safe as 10 | 25 | 50 | 100 } }).catch(() => {
      setPageSizeState(previous);
      toast.error("Couldn't save page size", {
        description: "Your preference wasn't synced. Reverted to previous value.",
      });
    });
  };

  // Realtime sync of this preference across devices for the current user.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const channel = supabase
        .channel(`user-prefs-${uid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_preferences",
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            const next = (payload.new as { runtime_audit_page_size?: number } | null)
              ?.runtime_audit_page_size;
            if (isValidPageSize(next)) {
              setPageSizeState((curr) => (curr === next ? curr : next));
            }
          },
        )
        .subscribe();
      cleanup = () => {
        supabase.removeChannel(channel);
      };
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = (nextPage = page) => {
    setLoading(true);
    fetchAudit({ data: { page: nextPage, pageSize } })
      .then((res) => {
        setEntries(res.entries);
        setTotal(res.total);
      })
      .catch(() => toast.error("Failed to load runtime config audit"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!pageSizeReady) return;
    load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, pageSizeReady]);

  useEffect(() => {
    const onUpdate = () => {
      if (page === 1) load(1);
      else setPage(1);
    };
    window.addEventListener("qa-runtime-config-updated", onUpdate);
    return () => window.removeEventListener("qa-runtime-config-updated", onUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const fmt = (b: boolean | null) => (b === null ? "—" : b ? "On" : "Off");
  const changed = (oldV: boolean | null, newV: boolean) =>
    oldV === null ? newV !== false : oldV !== newV;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" /> Runtime Config Audit Log
        </CardTitle>
        <CardDescription>
          Every change to live execution and performance mode. Admin-only.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Changed by</TableHead>
              <TableHead>Live execution</TableHead>
              <TableHead>Performance mode</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
                <TableRow key={`sk-${i}`}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="mb-1 h-4 w-28" />
                    <Skeleton className="h-3 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                </TableRow>
              ))}
            {!loading && entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
                    <History className="h-6 w-6 opacity-40" />
                    <div className="font-medium text-foreground">No audit entries yet</div>
                    <div>
                      Changes to live execution or performance mode will appear here.
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(e.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{e.changedByName ?? "—"}</div>
                    {e.changedByEmail && (
                      <div className="text-xs text-muted-foreground">{e.changedByEmail}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {changed(e.oldLiveEnabled, e.newLiveEnabled) ? (
                      <span>
                        {fmt(e.oldLiveEnabled)} → <strong>{fmt(e.newLiveEnabled)}</strong>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{fmt(e.newLiveEnabled)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {changed(e.oldPerformanceMode, e.newPerformanceMode) ? (
                      <span>
                        {fmt(e.oldPerformanceMode)} → <strong>{fmt(e.newPerformanceMode)}</strong>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{fmt(e.newPerformanceMode)}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              {total === 0 ? "0 entries" : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPage(1);
                setPageSize(Number(v));
              }}
            >
              <SelectTrigger className="h-7 w-[88px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InviteAgentCard() {
  const invite = useServerFn(inviteAgent);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const genPassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setPassword(out + "!7");
  };

  const submit = async () => {
    if (!email || !name || !password) {
      toast.error("Email, name and password are required");
      return;
    }
    setBusy(true);
    try {
      const res = await invite({ data: { email, name, password } });
      toast.success(`Invited ${res.email} as QA Agent`);
      setEmail("");
      setName("");
      setPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Invite a QA Agent
        </CardTitle>
        <CardDescription>
          Create an active agent account by email. They can sign in immediately with the password
          you set; role is assigned automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div className="grid gap-1">
          <Label htmlFor="invite-name">Full name</Label>
          <Input
            id="invite-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Tester"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@company.com"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="invite-pwd">Temporary password</Label>
          <div className="flex gap-1">
            <Input
              id="invite-pwd"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 chars"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Generate"
              aria-label="Generate temporary password"
              onClick={genPassword}
            >
              <KeyRound aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button onClick={submit} disabled={busy}>
          <Plus className="mr-1 h-4 w-4" />
          {busy ? "Inviting…" : "Invite agent"}
        </Button>
      </CardContent>
    </Card>
  );
}

function SampleAdminCard() {
  const reset = useServerFn(resetSampleAdmin);
  const [creds, setCreds] = useState<{ email: string; password: string; name: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const r = await reset({});
      setCreds({ email: r.email, password: r.password, name: r.name });
      toast.success("Sample admin account ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Sample admin account
        </CardTitle>
        <CardDescription>
          Generate or reset a known-good admin login for demos and onboarding. The credentials below
          are recreated each time you click reset.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" onClick={run} disabled={busy}>
          <RotateCcw className="mr-1 h-4 w-4" />
          {busy ? "Resetting…" : "Reset sample admin"}
        </Button>
        {creds && (
          <div className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Name</div>
              <div className="font-medium">{creds.name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Email</div>
              <div className="flex items-center gap-1 font-mono">
                {creds.email}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  aria-label="Copy email to clipboard"
                  onClick={() => copy(creds.email)}
                >
                  <Copy aria-hidden="true" className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Password</div>
              <div className="flex items-center gap-1 font-mono">
                {creds.password}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  aria-label="Copy password to clipboard"
                  onClick={() => copy(creds.password)}
                >
                  <Copy aria-hidden="true" className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  v,
  on,
  className,
}: {
  label: string;
  v: boolean;
  on: (c: boolean) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 ${className ?? ""}`}
    >
      <Label className="cursor-pointer">{label}</Label>
      <Switch checked={v} onCheckedChange={on} />
    </div>
  );
}

function ChipListCard({
  title,
  description,
  items,
  onChange,
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
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/60 px-2.5 py-1 text-xs"
            >
              {i}
              <button
                onClick={() => remove(i)}
                aria-label={`Remove ${i}`}
                className="rounded-full hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {items.length === 0 && (
            <span className="text-xs text-muted-foreground">No items yet.</span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Add new…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button onClick={add}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddFormRow({
  modules,
  agents,
  onAdd,
}: {
  modules: string[];
  agents: string[];
  onAdd: (f: {
    name: string;
    module: string;
    status: string;
    passed: number;
    failed: number;
    openDefects: number;
    lastTested: string;
    assignedAgent: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [mod, setMod] = useState(modules[0] ?? "");
  const [agent, setAgent] = useState(agents[0] ?? "");
  return (
    <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Form name (e.g. 1099-NEC)"
      />
      <Select value={mod} onValueChange={setMod}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {modules.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={agent} onValueChange={setAgent}>
        <SelectTrigger>
          <SelectValue placeholder="Assign agent" />
        </SelectTrigger>
        <SelectContent>
          {agents.map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        onClick={() => {
          if (!name.trim()) {
            toast.error("Form name required");
            return;
          }
          onAdd({
            name: name.trim(),
            module: mod,
            status: "Pending",
            passed: 0,
            failed: 0,
            openDefects: 0,
            lastTested: new Date().toISOString(),
            assignedAgent: agent,
          });
          setName("");
        }}
      >
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
    return audit
      .filter((a) =>
        [a.defectId, a.field, a.oldValue ?? "", a.newValue ?? "", a.changedBy]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
      .slice(0, 200);
  }, [audit, q]);

  if (currentUser?.role !== "admin") {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Admin only.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Audit Log</CardTitle>
          <CardDescription>
            Every defect status, priority, severity, assignment and validity change. {audit.length}{" "}
            entries.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Input
            className="w-60"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button variant="outline" onClick={() => exportCsv("audit-log", audit)}>
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
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
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(a.changedAt).toLocaleString()}
                </TableCell>
                <TableCell className="font-mono text-xs">{a.defectId}</TableCell>
                <TableCell className="capitalize">{a.field.replace(/_/g, " ")}</TableCell>
                <TableCell>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground line-through">
                    {a.oldValue ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">
                    {a.newValue ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{a.changedBy}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No audit entries match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type RoleAuditRow = {
  id: string;
  target_user_id: string;
  target_name: string;
  old_role: string | null;
  new_role: string;
  changed_by_id: string;
  changed_by_name: string;
  changed_at: string;
};

function RoleAuditTable() {
  const { currentUser } = useQA();
  const [rows, setRows] = useState<RoleAuditRow[]>([]);
  useEffect(() => {
    if (currentUser?.role !== "admin") return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("role_audit_log")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(200);
      if (alive) setRows((data ?? []) as RoleAuditRow[]);
    };
    void load();
    const ch = supabase
      .channel("role-audit")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "role_audit_log" },
        () => void load(),
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [currentUser]);

  if (currentUser?.role !== "admin") return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Role Changes</CardTitle>
        <CardDescription>
          History of admin/agent role updates. {rows.length} entries.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>User</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(r.changed_at).toLocaleString()}
                </TableCell>
                <TableCell>{r.target_name || r.target_user_id.slice(0, 8)}</TableCell>
                <TableCell>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {r.old_role ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="rounded bg-success/10 px-1.5 py-0.5 text-xs text-success">
                    {r.new_role}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {r.changed_by_name || r.changed_by_id.slice(0, 8)}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  No role changes yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type ExportAuditRow = {
  id: string;
  user_id: string | null;
  user_name: string;
  role: string;
  scope: string;
  environment: string | null;
  filters: unknown;
  row_count: number;
  status: string;
  error: string | null;
  job_id: string | null;
  created_at: string;
};

function ExportAuditTable() {
  const { currentUser } = useQA();
  const [rows, setRows] = useState<ExportAuditRow[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (currentUser?.role !== "admin") return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from("export_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (alive) setRows((data ?? []) as ExportAuditRow[]);
    };
    void load();
    const ch = supabase
      .channel(`export-audit-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "export_audit_log" },
        () => void load(),
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [currentUser]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!term) return true;
      return [
        r.user_name,
        r.role,
        r.scope,
        r.environment ?? "",
        r.status,
        r.error ?? "",
        JSON.stringify(r.filters ?? {}),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [rows, q, statusFilter]);

  if (currentUser?.role !== "admin") return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Export Audit Log</CardTitle>
          <CardDescription>
            Who exported what, when, and with which filters. {rows.length} entries.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="w-60"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button
            variant="outline"
            onClick={() =>
              exportCsv("export-audit", filtered as unknown as Record<string, unknown>[])
            }
          >
            <Download className="mr-1 h-4 w-4" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Env</TableHead>
              <TableHead>Filters</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
                <TableCell className="text-sm">{r.user_name}</TableCell>
                <TableCell className="text-xs capitalize">{r.role}</TableCell>
                <TableCell className="text-xs">{r.scope}</TableCell>
                <TableCell className="text-xs">{r.environment ?? "All"}</TableCell>
                <TableCell
                  className="max-w-[260px] truncate font-mono text-xs text-muted-foreground"
                  title={JSON.stringify(r.filters ?? {})}
                >
                  {JSON.stringify(r.filters ?? {})}
                </TableCell>
                <TableCell className="text-right text-sm">{r.row_count}</TableCell>
                <TableCell>
                  <Badge
                    variant={r.status === "success" ? "default" : "destructive"}
                    className="capitalize"
                  >
                    {r.status}
                  </Badge>
                  {r.error && <div className="mt-1 text-xs text-destructive">{r.error}</div>}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  No export audit entries.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ProfilePictureCard() {
  const { currentUser, updateUser } = useQA();
  const [uploading, setUploading] = useState(false);
  const inputRef = useState<HTMLInputElement | null>(null);

  if (!currentUser) return null;

  const handleFile = async (file: File) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Only PNG, JPG, JPEG, and WEBP files are allowed.");
      return;
    }
    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
      toast.error("Image size is too large. Please upload a smaller image (max 5 MB).");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${currentUser.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const r = await updateUser(currentUser.id, { avatarUrl: path });
      if (!r.ok) throw new Error(r.error);
      toast.success("Profile picture updated successfully.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Unable to upload profile picture. ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      if (currentUser.avatarUrl) {
        await supabase.storage
          .from("avatars")
          .remove([currentUser.avatarUrl])
          .catch(() => {});
      }
      const r = await updateUser(currentUser.id, { avatarUrl: null });
      if (!r.ok) throw new Error(r.error);
      toast.success("Profile picture removed.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Unable to remove profile picture. ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Profile</CardTitle>
        <CardDescription>
          Profile picture and account details for the signed-in user.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-6">
          <UserAvatar
            name={currentUser.name}
            email={currentUser.email}
            avatarUrl={currentUser.avatarUrl}
            size="xl"
          />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  ref={(el) => {
                    inputRef[1](el);
                  }}
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.currentTarget.value = "";
                  }}
                />
                <Button asChild disabled={uploading} variant="default">
                  <span className="cursor-pointer">
                    <Upload className="mr-1 h-4 w-4" />
                    {uploading
                      ? "Uploading…"
                      : currentUser.avatarUrl
                        ? "Change picture"
                        : "Upload picture"}
                  </span>
                </Button>
              </label>
              {currentUser.avatarUrl && (
                <Button variant="outline" disabled={uploading} onClick={handleRemove}>
                  <Trash2 className="mr-1 h-4 w-4" /> Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, JPEG or WEBP — up to 5 MB. A default avatar is generated when no picture is
              uploaded.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Name</Label>
            <Input value={currentUser.name ?? ""} disabled />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={currentUser.email ?? ""} disabled />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={currentUser.role ?? ""} disabled className="capitalize" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
