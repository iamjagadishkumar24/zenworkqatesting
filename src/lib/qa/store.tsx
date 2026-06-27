import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type {
  AuditEntry,
  Defect,
  DefectStatus,
  Environment,
  FormItem,
  Module,
  Priority,
  Role,
  Severity,
  TestStatus,
  User,
} from "./types";
import { filterByEnvironment, scopeForUser } from "./scope";
import { matchesTaxYear, type TaxYearFilter } from "./taxYear";

type DefectWithVersion = Defect & { version: number };

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  defectId: string | null;
  environment: Environment | null;
  read: boolean;
  createdAt: string;
};

export type DefectPreset = "open" | "valid" | "invalid" | "fixed" | "retest" | "all";

export type DashboardStats = {
  total: number;
  open: number;
  valid: number;
  invalid: number;
  fixed: number;
  retest: number;
};

export type AgentWorkloadMetric = {
  id: string;
  name: string;
  assignedDefects: number;
  openAssignedDefects: number;
  completedDefects: number;
  reportedDefects: number;
  pendingReviewDefects: number;
  activeRetests: number;
  completedRetests: number;
  totalOpenWorkload: number;
};

type RetestMetricInput = {
  assigned_agent_id?: string | null;
  assigned_agent_name?: string | null;
  status: string;
};

export function isFixedDefectStatus(status: DefectStatus | string): boolean {
  return status === "Fixed" || status === "Closed";
}

export function isOpenDefectStatus(status: DefectStatus | string): boolean {
  return !isFixedDefectStatus(status);
}

export function computeDashboardStats<T extends Pick<Defect, "status" | "validity">>(
  defects: readonly T[],
): DashboardStats {
  return {
    total: defects.length,
    open: defects.filter((d) => isOpenDefectStatus(d.status)).length,
    valid: defects.filter((d) => d.validity === "Valid").length,
    invalid: defects.filter((d) => d.validity === "Invalid").length,
    fixed: defects.filter((d) => isFixedDefectStatus(d.status)).length,
    retest: defects.filter((d) => d.status === "Retest Required").length,
  };
}

export function scopeDefectsForDashboard<T extends Defect>(
  defects: readonly T[],
  currentUser: Pick<User, "name" | "role"> | null,
  env: Environment | null | undefined,
  taxYear: TaxYearFilter,
): T[] {
  const byUser = scopeForUser([...defects], currentUser);
  const byEnv = filterByEnvironment(byUser, env);
  return byEnv.filter((d) => matchesTaxYear(d.taxYear, taxYear));
}

export function applyDefectPreset<T extends Pick<Defect, "status" | "validity">>(
  defects: readonly T[],
  preset?: DefectPreset | string | null,
): T[] {
  if (!preset || preset === "all") return [...defects];
  return defects.filter((d) => {
    switch (preset) {
      case "open":
        return isOpenDefectStatus(d.status);
      case "valid":
        return d.validity === "Valid";
      case "invalid":
        return d.validity === "Invalid";
      case "fixed":
        return isFixedDefectStatus(d.status);
      case "retest":
        return d.status === "Retest Required";
      default:
        return true;
    }
  });
}

export function searchDefects<
  T extends Pick<
    Defect,
    | "id"
    | "title"
    | "formFeature"
    | "module"
    | "status"
    | "priority"
    | "severity"
    | "assignedAgent"
    | "createdBy"
  > & { taxYear?: string },
>(defects: readonly T[], query: string | null | undefined): T[] {
  const term = (query ?? "").trim().toLowerCase();
  if (!term) return [...defects];
  return defects.filter((d) =>
    [
      d.id,
      d.title,
      d.formFeature,
      d.module,
      d.status,
      d.priority,
      d.severity,
      d.assignedAgent,
      d.createdBy,
      d.taxYear ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(term),
  );
}

export function groupDefectsByField<T extends Defect>(
  defects: readonly T[],
  field: keyof Pick<Defect, "module" | "formFeature" | "status" | "assignedAgent" | "createdBy">,
  fallback = "Unassigned",
): Record<string, T[]> {
  return defects.reduce<Record<string, T[]>>((acc, defect) => {
    const raw = defect[field];
    const key = typeof raw === "string" && raw.trim() ? raw : fallback;
    acc[key] = [...(acc[key] ?? []), defect];
    return acc;
  }, {});
}

export function sortDefectsByUpdatedAt<T extends Pick<Defect, "id" | "createdAt" | "updatedAt">>(
  defects: readonly T[],
  dir: "asc" | "desc" = "desc",
): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...defects].sort((a, b) => {
    const at = Date.parse(a.updatedAt || a.createdAt || "");
    const bt = Date.parse(b.updatedAt || b.createdAt || "");
    const time = (Number.isNaN(at) ? 0 : at) - (Number.isNaN(bt) ? 0 : bt);
    if (time !== 0) return time * factor;
    return a.id.localeCompare(b.id) * factor;
  });
}

export function computeAgentWorkloadMetrics(
  users: readonly User[],
  defects: readonly Defect[],
  retests: readonly RetestMetricInput[] = [],
): AgentWorkloadMetric[] {
  return users
    .filter((u) => u.role === "agent" && u.active !== false)
    .map((user) => {
      const assigned = defects.filter((d) => d.assignedAgent === user.name);
      const activeRetests = retests.filter(
        (r) =>
          r.status !== "Completed" &&
          (r.assigned_agent_id === user.id || r.assigned_agent_name === user.name),
      ).length;
      const completedRetests = retests.filter(
        (r) =>
          r.status === "Completed" &&
          (r.assigned_agent_id === user.id || r.assigned_agent_name === user.name),
      ).length;
      const openAssignedDefects = assigned.filter((d) => isOpenDefectStatus(d.status)).length;
      return {
        id: user.id,
        name: user.name,
        assignedDefects: assigned.length,
        openAssignedDefects,
        completedDefects: assigned.filter((d) => isFixedDefectStatus(d.status)).length,
        reportedDefects: defects.filter((d) => d.createdBy === user.name).length,
        pendingReviewDefects: assigned.filter((d) => (d.validity ?? "Unverified") === "Unverified")
          .length,
        activeRetests,
        completedRetests,
        totalOpenWorkload: openAssignedDefects + activeRetests,
      };
    });
}

type State = {
  users: User[];
  forms: FormItem[];
  defects: DefectWithVersion[];
  audit: AuditEntry[];
  notifications: NotificationItem[];
  currentUser: User | null;
  loading: boolean;
};

type Result = { ok: boolean; error?: string };

export type RealtimeDebugEvent = {
  id: string;
  table: "defects" | "defect_comments";
  event: "INSERT" | "UPDATE" | "DELETE";
  at: string;
  role: Role | "unknown";
  rowId: string | null;
  summary: string;
};

export type RealtimeStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

type Ctx = State & {
  realtimeEvents: RealtimeDebugEvent[];
  realtimeStatus: RealtimeStatus;
  realtimeChannelName: string | null;
  realtimeReconnectAttempts: number;
  realtimeLastEventAt: string | null;
  clearRealtimeEvents: () => void;
  login: (email: string, password: string) => Promise<Result>;
  signup: (name: string, email: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
  addDefect: (
    d: Omit<Defect, "id" | "createdAt" | "updatedAt" | "updatedBy" | "createdBy" | "comments">,
  ) => Promise<Result>;
  updateDefect: (id: string, patch: Partial<Defect>) => Promise<Result & { conflict?: boolean }>;
  deleteDefect: (id: string) => Promise<Result>;
  addComment: (id: string, text: string) => Promise<Result>;
  updateComment: (commentId: string, text: string) => Promise<Result>;
  deleteComment: (commentId: string) => Promise<Result>;
  updateUser: (id: string, patch: Partial<User>) => Promise<Result>;
  removeUser: (id: string) => Promise<Result>;
  updateForm: (id: string, patch: Partial<FormItem>) => Promise<Result>;
  addForm: (f: Omit<FormItem, "id">) => Promise<Result>;
  markNotificationsRead: (ids?: string[]) => Promise<void>;
};

const Context = createContext<Ctx | null>(null);

type DefectRow = {
  id: string;
  module: string;
  form_feature: string;
  title: string;
  description: string;
  steps_to_reproduce: string;
  expected_result: string;
  actual_result: string;
  attachment_url: string | null;
  attachment_url2: string | null;
  evidence_url: string | null;
  screenshot_url: string | null;
  video_url: string | null;
  excel_url: string | null;
  drive_url: string | null;
  jira_url: string | null;
  validity: string;
  status: string;
  priority: string;
  severity: string;
  environment: string;
  tax_year: string | null;
  quickbooks_desktop_category?: string | null;
  schedules?: string[] | null;
  state?: string | null;
  assigned_agent: string;
  created_by: string;
  updated_by: string;
  version: number;
  created_at: string;
  updated_at: string;
};
type CommentRow = {
  id: string;
  defect_id: string;
  author: string;
  text: string;
  created_at: string;
  updated_at?: string | null;
  updated_by?: string | null;
  edited?: boolean | null;
};
type AuditRow = {
  id: string;
  defect_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_at: string;
};
type FormRow = {
  id: string;
  name: string;
  module: string;
  status: string;
  passed: number;
  failed: number;
  open_defects: number;
  last_tested: string;
  assigned_agent: string;
  environment?: string;
};
type NotifRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  defect_id: string | null;
  environment: string | null;
  read: boolean;
  created_at: string;
};

function rowToDefect(r: DefectRow, comments: CommentRow[] = []): DefectWithVersion {
  return {
    id: r.id,
    module: r.module as Module,
    formFeature: r.form_feature,
    taxYear: r.tax_year ?? undefined,
    schedules: Array.isArray(r.schedules) ? r.schedules : undefined,
    title: r.title,
    description: r.description,
    stepsToReproduce: r.steps_to_reproduce,
    expectedResult: r.expected_result,
    actualResult: r.actual_result,
    attachmentUrl: r.attachment_url ?? undefined,
    attachmentUrl2: r.attachment_url2 ?? undefined,
    evidenceUrl: r.evidence_url ?? undefined,
    screenshotUrl: r.screenshot_url ?? undefined,
    videoUrl: r.video_url ?? undefined,
    excelUrl: r.excel_url ?? undefined,
    driveUrl: r.drive_url ?? undefined,
    jiraUrl: r.jira_url ?? undefined,
    validity: (r.validity as Defect["validity"]) ?? "Unverified",
    environment: (r.environment as Environment) ?? "Production",
    status: r.status as DefectStatus,
    priority: r.priority as Priority,
    severity: r.severity as Severity,
    assignedAgent: r.assigned_agent,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    qbDesktopCategory: (r.quickbooks_desktop_category as Defect["qbDesktopCategory"]) ?? undefined,
    state: r.state ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    version: r.version,
    comments: comments
      .filter((c) => c.defect_id === r.id)
      .map((c) => ({
        id: c.id,
        author: c.author,
        text: c.text,
        createdAt: c.created_at,
        updatedAt: c.updated_at ?? undefined,
        updatedBy: c.updated_by ?? undefined,
        edited: !!c.edited,
      })),
  };
}

function rowToAudit(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    defectId: r.defect_id,
    field: r.field,
    oldValue: r.old_value,
    newValue: r.new_value,
    changedBy: r.changed_by,
    changedAt: r.changed_at,
  };
}

function rowToForm(r: FormRow): FormItem {
  return {
    id: r.id,
    name: r.name,
    module: r.module as Module,
    status: r.status as TestStatus,
    passed: r.passed,
    failed: r.failed,
    openDefects: r.open_defects,
    lastTested: r.last_tested,
    assignedAgent: r.assigned_agent,
  };
}

export function QAProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    users: [],
    forms: [],
    defects: [],
    audit: [],
    notifications: [],
    currentUser: null,
    loading: true,
  });
  const commentsRef = useRef<CommentRow[]>([]);
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeDebugEvent[]>([]);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle");
  const [realtimeChannelName, setRealtimeChannelName] = useState<string | null>(null);
  const [realtimeReconnectAttempts, setRealtimeReconnectAttempts] = useState(0);
  const [realtimeLastEventAt, setRealtimeLastEventAt] = useState<string | null>(null);
  const roleRef = useRef<Role | "unknown">("unknown");
  roleRef.current = state.currentUser?.role ?? "unknown";

  // ---- Backend-driven runtime config ------------------------------------
  // `liveEnabled` gates whether the QA store opens the Realtime channel.
  // `performanceMode` switches realtime state writes to an rAF-batched path
  // so high event rates can't cause UI lag. Both flags come from the server
  // (see `runtime-config.functions.ts`); no UI control is exposed.
  const [runtimeConfig, setRuntimeConfig] = useState<{
    liveEnabled: boolean;
    performanceMode: boolean;
  }>({ liveEnabled: true, performanceMode: false });
  const perfModeRef = useRef(false);
  perfModeRef.current = runtimeConfig.performanceMode;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { getQARuntimeConfig } = await import("./runtime-config.functions");
        const cfg = await getQARuntimeConfig();
        if (!cancelled) setRuntimeConfig(cfg);
      } catch {
        // network/SSR failure → keep defaults (live on, perf off)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime status transitions are intentionally NOT surfaced to the user
  // per product requirement. The subscription keeps running in the background;
  // we just track the previous value for parity with the public store shape.
  const prevStatusRef = useRef<RealtimeStatus>("idle");
  useEffect(() => {
    prevStatusRef.current = realtimeStatus;
  }, [realtimeStatus]);

  // Deterministic hook for E2E tests: expose internal setters on window so
  // a test can simulate a CHANNEL_ERROR + recovery without racing the real
  // WebSocket. No-op in production unless the test explicitly opts in.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as { __qaRealtimeMock?: unknown }).__qaRealtimeMock = {
      setStatus: (s: RealtimeStatus) => setRealtimeStatus(s),
      bumpReconnect: () => setRealtimeReconnectAttempts((n) => n + 1),
      resetReconnect: () => setRealtimeReconnectAttempts(0),
    };
    return () => {
      delete (window as unknown as { __qaRealtimeMock?: unknown }).__qaRealtimeMock;
    };
  }, []);

  const pushEvent = (e: Omit<RealtimeDebugEvent, "id" | "at" | "role">) => {
    const at = new Date().toISOString();
    setRealtimeLastEventAt(at);
    setRealtimeEvents((prev) =>
      [
        {
          ...e,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at,
          role: roleRef.current,
        },
        ...prev,
      ].slice(0, 100),
    );
  };

  // Auth lifecycle
  useEffect(() => {
    let mounted = true;
    const hydrateUser = async (authUserId: string | null) => {
      if (!authUserId) {
        setState((s) => ({ ...s, currentUser: null }));
        return;
      }
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, email, active, avatar_url")
          .eq("id", authUserId)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", authUserId),
      ]);
      if (!profile) return;
      const role: Role = roles?.some((r) => r.role === "admin") ? "admin" : "agent";
      if (profile.active === false) {
        await supabase.auth.signOut();
        setState((s) => ({ ...s, currentUser: null }));
        if (typeof window !== "undefined") {
          const { toast } = await import("sonner");
          toast.error("Your account is not active. Please contact the admin.");
        }
        return;
      }
      setState((s) => ({
        ...s,
        currentUser: {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          role,
          active: profile.active,
          avatarUrl: (profile as { avatar_url?: string | null }).avatar_url ?? null,
        },
      }));
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      void hydrateUser(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      void hydrateUser(session?.user.id ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Data load + realtime
  useEffect(() => {
    if (!state.currentUser) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    // Backend kill-switch: skip opening the Realtime channel entirely.
    // The initial loadAll() below still runs so the UI is populated.
    const liveEnabled = runtimeConfig.liveEnabled;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    // Performance mode: coalesce realtime-driven state updates inside a
    // single rAF frame so a burst of events never causes UI lag. Realtime
    // callbacks below call `applyState` instead of `setState`; in normal
    // mode it forwards straight to setState.
    let pendingUpdaters: Array<(s: State) => State> = [];
    let rafQueued = false;
    const flushPending = () => {
      rafQueued = false;
      const queue = pendingUpdaters;
      pendingUpdaters = [];
      if (queue.length === 0) return;
      setState((s) => queue.reduce((acc, u) => u(acc), s));
    };
    const applyState = (updater: (s: State) => State) => {
      if (!perfModeRef.current) {
        setState(updater);
        return;
      }
      pendingUpdaters.push(updater);
      if (rafQueued) return;
      rafQueued = true;
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(flushPending);
      else setTimeout(flushPending, 16);
    };

    const loadAll = async () => {
      const [profilesR, rolesR, formsR, defectsR, commentsR, auditR, notifR] = await Promise.all([
        supabase.from("profiles_safe").select("id, name, active, avatar_url"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("forms").select("*"),
        supabase.from("defects").select("*").order("updated_at", { ascending: false }),
        supabase.from("defect_comments").select("*").order("created_at", { ascending: true }),
        supabase.from("defect_audit_log").select("*").order("changed_at", { ascending: false }),
        supabase
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      if (cancelled) return;
      const rolesByUser = new Map<string, Role>();
      (rolesR.data ?? []).forEach((r) => {
        if (r.role === "admin") rolesByUser.set(r.user_id, "admin");
        else if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, "agent");
      });
      // Admins may additionally fetch emails (RLS allows it). Non-admins get empty email.
      const isAdmin = rolesByUser.get(state.currentUser!.id) === "admin";
      const emailsById = new Map<string, string>();
      if (isAdmin) {
        const { data: full } = await supabase.from("profiles").select("id, email");
        (full ?? []).forEach((r) => {
          if (r.email) emailsById.set(r.id, r.email);
        });
      } else if (state.currentUser) {
        emailsById.set(state.currentUser.id, state.currentUser.email ?? "");
      }
      const users: User[] = (profilesR.data ?? [])
        .filter(
          (
            p,
          ): p is {
            id: string;
            name: string | null;
            active: boolean | null;
            avatar_url: string | null;
          } => !!p.id,
        )
        .map((p) => ({
          id: p.id,
          name: p.name ?? "",
          email: emailsById.get(p.id) ?? "",
          active: p.active ?? true,
          avatarUrl: p.avatar_url ?? null,
          role: rolesByUser.get(p.id) ?? "agent",
        }));
      const comments = (commentsR.data ?? []) as CommentRow[];
      commentsRef.current = comments;
      setState((s) => ({
        ...s,
        loading: false,
        users,
        forms: (formsR.data ?? []).map((f) => rowToForm(f as FormRow)),
        defects: (defectsR.data ?? []).map((d) => rowToDefect(d as DefectRow, comments)),
        audit: (auditR.data ?? []).map((a) => rowToAudit(a as AuditRow)),
        notifications: ((notifR.data ?? []) as NotifRow[]).map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          defectId: n.defect_id,
          environment: (n.environment as Environment | null) ?? null,
          read: n.read,
          createdAt: n.created_at,
        })),
      }));
    };
    void loadAll();

    if (!liveEnabled) {
      // Realtime disabled by backend toggle — initial data still loads above,
      // but we skip opening the WebSocket subscription entirely.
      setRealtimeStatus("idle");
      return () => {
        cancelled = true;
      };
    }

    const channelName = `qa-realtime-${state.currentUser?.id ?? "anon"}`;
    setRealtimeChannelName(channelName);
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "defects" }, (payload) => {
        const ev = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        const row = (payload.new ?? payload.old) as
          | { id?: string; title?: string; status?: string }
          | undefined;
        pushEvent({
          table: "defects",
          event: ev,
          rowId: row?.id ?? null,
          summary:
            ev === "DELETE"
              ? `Deleted ${row?.id ?? ""}`
              : `${ev} ${row?.id ?? ""} — status: ${row?.status ?? "?"}`,
        });
        applyState((s) => {
          let next = s.defects;
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = rowToDefect(payload.new as DefectRow, commentsRef.current);
            const exists = next.find((d) => d.id === row.id);
            // Out-of-order guard: ignore stale realtime events that arrive
            // after a newer version is already in state.
            if (exists && exists.version > row.version) return s;
            next = exists ? next.map((d) => (d.id === row.id ? row : d)) : [row, ...next];
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            next = next.filter((d) => d.id !== oldId);
          }
          return { ...s, defects: next };
        });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "defect_comments" },
        (payload) => {
          const ev = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          const row = (payload.new ?? payload.old) as
            | { id?: string; defect_id?: string; author?: string; text?: string }
            | undefined;
          pushEvent({
            table: "defect_comments",
            event: ev,
            rowId: row?.defect_id ?? null,
            summary:
              ev === "DELETE"
                ? `Deleted comment on ${row?.defect_id ?? "?"}`
                : `${ev} comment on ${row?.defect_id ?? "?"} by ${row?.author ?? "?"}`,
          });
          if (payload.eventType === "INSERT") {
            const c = payload.new as CommentRow;
            commentsRef.current = [...commentsRef.current, c];
          } else if (payload.eventType === "UPDATE") {
            const c = payload.new as CommentRow;
            commentsRef.current = commentsRef.current.map((x) => (x.id === c.id ? c : x));
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            commentsRef.current = commentsRef.current.filter((c) => c.id !== oldId);
          }
          applyState((s) => ({
            ...s,
            defects: s.defects.map((d) => ({
              ...d,
              comments: commentsRef.current
                .filter((c) => c.defect_id === d.id)
                .map((c) => ({
                  id: c.id,
                  author: c.author,
                  text: c.text,
                  createdAt: c.created_at,
                  updatedAt: c.updated_at ?? undefined,
                  updatedBy: c.updated_by ?? undefined,
                  edited: !!c.edited,
                })),
            })),
          }));
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "forms" }, (payload) => {
        applyState((s) => {
          let next = s.forms;
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = rowToForm(payload.new as FormRow);
            next = next.find((f) => f.id === row.id)
              ? next.map((f) => (f.id === row.id ? row : f))
              : [...next, row];
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            next = next.filter((f) => f.id !== oldId);
          }
          return { ...s, forms: next };
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) => {
        const row = (payload.new ?? payload.old) as { id?: string; active?: boolean } | undefined;
        if (row?.id && row.id === state.currentUser?.id && row.active === false) {
          void (async () => {
            await supabase.auth.signOut();
            const { toast } = await import("sonner");
            toast.error("Your account has been deactivated by an administrator.");
          })();
          return;
        }
        void loadAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => {
        void loadAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_invites" }, () => {
        void loadAll();
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_audit_log" },
        () => {
          void loadAll();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "defect_audit_log" },
        (payload) => {
          const entry = rowToAudit(payload.new as AuditRow);
          applyState((s) => ({ ...s, audit: [entry, ...s.audit] }));
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload) => {
          applyState((s) => {
            let next = s.notifications;
            if (payload.eventType === "INSERT") {
              const n = payload.new as NotifRow;
              // Live toast for the active user's new notifications.
              if (n.user_id === state.currentUser?.id) {
                void import("sonner").then(({ toast }) => {
                  toast(n.title, { description: n.body ?? undefined });
                });
              }
              next = [
                {
                  id: n.id,
                  type: n.type,
                  title: n.title,
                  body: n.body,
                  defectId: n.defect_id,
                  environment: (n.environment as Environment | null) ?? null,
                  read: n.read,
                  createdAt: n.created_at,
                },
                ...next,
              ].slice(0, 200);
            } else if (payload.eventType === "UPDATE") {
              const n = payload.new as NotifRow;
              next = next.map((x) => (x.id === n.id ? { ...x, read: n.read } : x));
            } else if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id: string }).id;
              next = next.filter((x) => x.id !== oldId);
            }
            return { ...s, notifications: next };
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("reconnecting");
          setRealtimeReconnectAttempts((n) => n + 1);
        } else if (status === "CLOSED") setRealtimeStatus("idle");
        else setRealtimeStatus("connecting");
        // Read-only probe for E2E: lets Playwright assert the realtime
        // subscription is alive without any visible UI indicator.
        if (typeof window !== "undefined") {
          (window as unknown as { __qaRealtimeProbe?: unknown }).__qaRealtimeProbe = {
            channelName,
            status,
            at: Date.now(),
          };
        }
      });
    setRealtimeStatus("connecting");

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      if (typeof window !== "undefined") {
        delete (window as unknown as { __qaRealtimeProbe?: unknown }).__qaRealtimeProbe;
      }
    };
  }, [state.currentUser?.id, runtimeConfig.liveEnabled]);

  const requireUser = () => {
    const u = state.currentUser;
    if (!u) throw new Error("Not authenticated");
    return u;
  };

  const ctx: Ctx = {
    ...state,
    realtimeEvents,
    realtimeStatus,
    realtimeChannelName,
    realtimeReconnectAttempts,
    realtimeLastEventAt,
    clearRealtimeEvents: () => setRealtimeEvents([]),
    login: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        try {
          const { recordAuthAttempt } = await import("./authAudit.functions");
          void recordAuthAttempt({
            data: {
              kind: "login_failure",
              email,
              reason: error.message,
              user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            },
          });
        } catch {
          /* noop */
        }
        return { ok: false, error: error.message };
      }
      try {
        const { recordAuthEvent } = await import("./activityLog");
        void recordAuthEvent({ kind: "login", email, success: true });
      } catch {
        /* noop */
      }
      return { ok: true };
    },
    signup: async (name, email, password) => {
      const cleanEmail = email.trim().toLowerCase();
      try {
        const { checkInviteEmail } = await import("./admin.functions");
        const check = await checkInviteEmail({ data: { email: cleanEmail } });
        if (!check.allowed) {
          if (check.reason === "inactive") {
            return { ok: false, error: "Your account is not active. Please contact the admin." };
          }
          return { ok: false, error: "Your email is not invited. Please contact the admin." };
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Could not verify invitation" };
      }
      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { name }, emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) {
        // Supabase returns a "weak_password" / pwned message when HIBP blocks it.
        const msg = error.message ?? "";
        const code = (error as { code?: string }).code ?? "";
        const isLeaked = /pwned|leaked|breach|weak_password/i.test(msg) || code === "weak_password";
        try {
          const { recordAuthAttempt } = await import("./authAudit.functions");
          void recordAuthAttempt({
            data: {
              kind: isLeaked ? "leaked_password_blocked" : "signup_failure",
              email: cleanEmail,
              reason: msg,
              user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            },
          });
        } catch {
          /* noop */
        }
        return { ok: false, error: msg };
      }
      try {
        const { recordAuthAttempt } = await import("./authAudit.functions");
        void recordAuthAttempt({
          data: {
            kind: "signup_success",
            email: cleanEmail,
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          },
        });
      } catch {
        /* noop */
      }
      return { ok: true };
    },
    logout: async () => {
      try {
        const { recordAuthEvent } = await import("./activityLog");
        const e = state.currentUser?.email;
        await recordAuthEvent({ kind: "logout", email: e });
      } catch {
        /* noop */
      }
      await supabase.auth.signOut();
    },

    addDefect: async (d) => {
      const me = requireUser();
      const ty =
        d.taxYear && /^\d{4}$/.test(d.taxYear) ? d.taxYear : String(new Date().getFullYear());
      const { data: nextId, error: idErr } = await supabase.rpc("next_scoped_id", {
        _kind: "defect",
        _tax_year: ty,
      });
      if (idErr || !nextId)
        return { ok: false, error: idErr?.message ?? "Could not allocate defect id" };
      const id = nextId as string;
      const { error } = await supabase.from("defects").insert({
        id,
        module: d.module,
        form_feature: d.formFeature,
        title: d.title,
        description: d.description,
        steps_to_reproduce: d.stepsToReproduce,
        expected_result: d.expectedResult,
        actual_result: d.actualResult,
        attachment_url: d.attachmentUrl || null,
        attachment_url2: d.attachmentUrl2 || null,
        evidence_url: d.evidenceUrl || null,
        screenshot_url: d.screenshotUrl || null,
        video_url: d.videoUrl || null,
        excel_url: d.excelUrl || null,
        drive_url: d.driveUrl || null,
        jira_url: d.jiraUrl || null,
        validity: d.validity || "Unverified",
        environment: d.environment || "Production",
        tax_year: d.taxYear || null,
        status: d.status,
        priority: d.priority,
        severity: d.severity,
        assigned_agent: d.assignedAgent,
        created_by: me.name,
        updated_by: me.name,
        quickbooks_desktop_category: d.qbDesktopCategory ?? null,
        schedules: Array.isArray(d.schedules) ? d.schedules : [],
        state: d.state ?? null,
      } as never);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    updateDefect: async (id, patch) => {
      const me = requireUser();
      const local = state.defects.find((d) => d.id === id);
      if (!local) return { ok: false, error: "Defect not found" };
      // Optimistic UI: apply the patch to local state immediately so the table
      // reflects the change while the server request is pending. If the server
      // rejects (error or version conflict), we restore the previous row below.
      const previous = local;
      setState((s) => ({
        ...s,
        defects: s.defects.map((d) => (d.id === id ? { ...d, ...patch, updatedBy: me.name } : d)),
      }));
      const dbPatch: Record<string, unknown> = { updated_by: me.name };
      const map: Record<string, string> = {
        module: "module",
        formFeature: "form_feature",
        title: "title",
        description: "description",
        stepsToReproduce: "steps_to_reproduce",
        expectedResult: "expected_result",
        actualResult: "actual_result",
        attachmentUrl: "attachment_url",
        attachmentUrl2: "attachment_url2",
        evidenceUrl: "evidence_url",
        screenshotUrl: "screenshot_url",
        videoUrl: "video_url",
        excelUrl: "excel_url",
        driveUrl: "drive_url",
        jiraUrl: "jira_url",
        validity: "validity",
        environment: "environment",
        taxYear: "tax_year",
        status: "status",
        priority: "priority",
        severity: "severity",
        assignedAgent: "assigned_agent",
        qbDesktopCategory: "quickbooks_desktop_category",
        schedules: "schedules",
      };
      for (const [k, dbk] of Object.entries(map)) {
        if (k in patch) dbPatch[dbk] = (patch as Record<string, unknown>)[k];
      }
      const { data, error } = await supabase
        .from("defects")
        .update(dbPatch as never)
        .eq("id", id)
        .eq("version", local.version)
        .select()
        .maybeSingle();
      if (error) {
        setState((s) => ({
          ...s,
          defects: s.defects.map((d) => (d.id === id ? previous : d)),
        }));
        return { ok: false, error: error.message };
      }
      if (!data) {
        // Optimistic lock conflict: fetch latest and surface
        const { data: latest } = await supabase
          .from("defects")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (latest) {
          setState((s) => ({
            ...s,
            defects: s.defects.map((d) =>
              d.id === id ? rowToDefect(latest as DefectRow, commentsRef.current) : d,
            ),
          }));
        }
        toast.error("Conflict: another agent updated this defect. Latest values were loaded.");
        return { ok: false, conflict: true, error: "Version conflict" };
      }
      setState((s) => ({
        ...s,
        defects: s.defects.map((d) =>
          d.id === id ? rowToDefect(data as DefectRow, commentsRef.current) : d,
        ),
      }));
      return { ok: true };
    },

    deleteDefect: async (id) => {
      const { error } = await supabase.from("defects").delete().eq("id", id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    addComment: async (id, text) => {
      const me = requireUser();
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "Comment cannot be empty" };
      if (trimmed.length > 2000)
        return { ok: false, error: "Comment is too long (max 2000 characters)" };
      const { error } = await supabase
        .from("defect_comments")
        .insert({ defect_id: id, author: me.name, text: trimmed });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    updateComment: async (commentId, text) => {
      const me = requireUser();
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "Comment cannot be empty" };
      if (trimmed.length > 2000)
        return { ok: false, error: "Comment is too long (max 2000 characters)" };
      const { error } = await supabase
        .from("defect_comments")
        .update({ text: trimmed, updated_by: me.name } as never)
        .eq("id", commentId);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    deleteComment: async (commentId) => {
      const { error } = await supabase.from("defect_comments").delete().eq("id", commentId);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    updateUser: async (id, patch) => {
      if (patch.role !== undefined) {
        const { error } = await supabase.rpc("change_user_role", {
          _target: id,
          _new_role: patch.role,
        });
        if (error) return { ok: false, error: error.message };
      }
      const profilePatch: Record<string, unknown> = {};
      if (patch.name !== undefined) profilePatch.name = patch.name;
      if (patch.active !== undefined) profilePatch.active = patch.active;
      if (patch.avatarUrl !== undefined) profilePatch.avatar_url = patch.avatarUrl;
      if (Object.keys(profilePatch).length) {
        const { error } = await supabase
          .from("profiles")
          .update(profilePatch as never)
          .eq("id", id);
        if (error) return { ok: false, error: error.message };
      }
      if (patch.avatarUrl !== undefined && id === state.currentUser?.id) {
        setState((s) =>
          s.currentUser
            ? { ...s, currentUser: { ...s.currentUser, avatarUrl: patch.avatarUrl ?? null } }
            : s,
        );
      }
      return { ok: true };
    },
    removeUser: async () => ({
      ok: false,
      error: "User removal must be performed by an administrator from the backend.",
    }),

    updateForm: async (id, patch) => {
      const dbPatch: Record<string, unknown> = {};
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.module !== undefined) dbPatch.module = patch.module;
      if (patch.status !== undefined) dbPatch.status = patch.status;
      if (patch.passed !== undefined) dbPatch.passed = patch.passed;
      if (patch.failed !== undefined) dbPatch.failed = patch.failed;
      if (patch.openDefects !== undefined) dbPatch.open_defects = patch.openDefects;
      if (patch.lastTested !== undefined) dbPatch.last_tested = patch.lastTested;
      if (patch.assignedAgent !== undefined) dbPatch.assigned_agent = patch.assignedAgent;
      const { error } = await supabase
        .from("forms")
        .update(dbPatch as never)
        .eq("id", id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    addForm: async (f) => {
      const id = `F-${Date.now()}`;
      const { error } = await supabase.from("forms").insert({
        id,
        name: f.name,
        module: f.module,
        status: f.status,
        passed: f.passed,
        failed: f.failed,
        open_defects: f.openDefects,
        last_tested: f.lastTested,
        assigned_agent: f.assignedAgent,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    markNotificationsRead: async (ids) => {
      const q = supabase.from("notifications").update({ read: true } as never);
      const r = ids && ids.length ? await q.in("id", ids) : await q.eq("read", false);
      if (r.error) toast.error(r.error.message);
    },
  };

  return <Context.Provider value={ctx}>{children}</Context.Provider>;
}

export function useQA() {
  const c = useContext(Context);
  if (!c) throw new Error("useQA must be used within QAProvider");
  return c;
}
