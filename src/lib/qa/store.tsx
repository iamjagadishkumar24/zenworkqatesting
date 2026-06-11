import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AuditEntry, Defect, DefectStatus, Environment, FormItem, Module, Priority, Role, Severity, TestStatus, User } from "./types";

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

type Ctx = State & {
  login: (email: string, password: string) => Promise<Result>;
  signup: (name: string, email: string, password: string) => Promise<Result>;
  logout: () => Promise<void>;
  addDefect: (d: Omit<Defect, "id" | "createdAt" | "updatedAt" | "updatedBy" | "createdBy" | "comments">) => Promise<Result>;
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
  id: string; module: string; form_feature: string; title: string; description: string;
  steps_to_reproduce: string; expected_result: string; actual_result: string;
  attachment_url: string | null; attachment_url2: string | null;
  evidence_url: string | null; screenshot_url: string | null;
  video_url: string | null; excel_url: string | null; drive_url: string | null;
  jira_url: string | null; validity: string;
  status: string; priority: string; severity: string;
  environment: string;
  assigned_agent: string; created_by: string; updated_by: string;
  version: number; created_at: string; updated_at: string;
};
type CommentRow = {
  id: string; defect_id: string; author: string; text: string;
  created_at: string;
  updated_at?: string | null;
  updated_by?: string | null;
  edited?: boolean | null;
};
type AuditRow = { id: string; defect_id: string; field: string; old_value: string | null; new_value: string | null; changed_by: string; changed_at: string };
type FormRow = { id: string; name: string; module: string; status: string; passed: number; failed: number; open_defects: number; last_tested: string; assigned_agent: string; environment?: string };
type NotifRow = { id: string; type: string; title: string; body: string; defect_id: string | null; environment: string | null; read: boolean; created_at: string };

function rowToDefect(r: DefectRow, comments: CommentRow[] = []): DefectWithVersion {
  return {
    id: r.id, module: r.module as Module, formFeature: r.form_feature,
    title: r.title, description: r.description,
    stepsToReproduce: r.steps_to_reproduce,
    expectedResult: r.expected_result, actualResult: r.actual_result,
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
    status: r.status as DefectStatus, priority: r.priority as Priority, severity: r.severity as Severity,
    assignedAgent: r.assigned_agent, createdBy: r.created_by, updatedBy: r.updated_by,
    createdAt: r.created_at, updatedAt: r.updated_at, version: r.version,
    comments: comments
      .filter((c) => c.defect_id === r.id)
      .map((c) => ({
        id: c.id, author: c.author, text: c.text, createdAt: c.created_at,
        updatedAt: c.updated_at ?? undefined,
        updatedBy: c.updated_by ?? undefined,
        edited: !!c.edited,
      })),
  };
}

function rowToAudit(r: AuditRow): AuditEntry {
  return {
    id: r.id, defectId: r.defect_id, field: r.field,
    oldValue: r.old_value, newValue: r.new_value,
    changedBy: r.changed_by, changedAt: r.changed_at,
  };
}

function rowToForm(r: FormRow): FormItem {
  return {
    id: r.id, name: r.name, module: r.module as Module, status: r.status as TestStatus,
    passed: r.passed, failed: r.failed, openDefects: r.open_defects,
    lastTested: r.last_tested, assignedAgent: r.assigned_agent,
  };
}

export function QAProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    users: [], forms: [], defects: [], audit: [], notifications: [], currentUser: null, loading: true,
  });
  const commentsRef = useRef<CommentRow[]>([]);

  // Auth lifecycle
  useEffect(() => {
    let mounted = true;
    const hydrateUser = async (authUserId: string | null) => {
      if (!authUserId) { setState((s) => ({ ...s, currentUser: null })); return; }
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, name, email, active").eq("id", authUserId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", authUserId),
      ]);
      if (!profile) return;
      const role: Role = roles?.some((r) => r.role === "admin") ? "admin" : "agent";
      if (profile.active === false) {
        await supabase.auth.signOut();
        setState((s) => ({ ...s, currentUser: null }));
        if (typeof window !== "undefined") {
          const { toast } = await import("sonner");
          toast.error("Your account has been deactivated. Contact an administrator.");
        }
        return;
      }
      setState((s) => ({ ...s, currentUser: { id: profile.id, name: profile.name, email: profile.email, role, active: profile.active } }));
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      void hydrateUser(data.session?.user.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      void hydrateUser(session?.user.id ?? null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // Data load + realtime
  useEffect(() => {
    if (!state.currentUser) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    const loadAll = async () => {
      const [profilesR, rolesR, formsR, defectsR, commentsR, auditR, notifR] = await Promise.all([
        supabase.from("profiles").select("id, name, email, active"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("forms").select("*"),
        supabase.from("defects").select("*").order("updated_at", { ascending: false }),
        supabase.from("defect_comments").select("*").order("created_at", { ascending: true }),
        supabase.from("defect_audit_log").select("*").order("changed_at", { ascending: false }),
        supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(200),
      ]);
      if (cancelled) return;
      const rolesByUser = new Map<string, Role>();
      (rolesR.data ?? []).forEach((r) => {
        if (r.role === "admin") rolesByUser.set(r.user_id, "admin");
        else if (!rolesByUser.has(r.user_id)) rolesByUser.set(r.user_id, "agent");
      });
      const users: User[] = (profilesR.data ?? []).map((p) => ({
        id: p.id, name: p.name, email: p.email, active: p.active,
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
          id: n.id, type: n.type, title: n.title, body: n.body,
          defectId: n.defect_id, environment: (n.environment as Environment | null) ?? null,
          read: n.read, createdAt: n.created_at,
        })),
      }));
    };
    void loadAll();

    const channel = supabase
      .channel("qa-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "defects" }, (payload) => {
        setState((s) => {
          let next = s.defects;
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const row = rowToDefect(payload.new as DefectRow, commentsRef.current);
            const exists = next.find((d) => d.id === row.id);
            next = exists ? next.map((d) => (d.id === row.id ? row : d)) : [row, ...next];
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            next = next.filter((d) => d.id !== oldId);
          }
          return { ...s, defects: next };
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "defect_comments" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const c = payload.new as CommentRow;
          commentsRef.current = [...commentsRef.current, c];
        } else if (payload.eventType === "DELETE") {
          const oldId = (payload.old as { id: string }).id;
          commentsRef.current = commentsRef.current.filter((c) => c.id !== oldId);
        }
        setState((s) => ({
          ...s,
          defects: s.defects.map((d) => ({
            ...d,
            comments: commentsRef.current
              .filter((c) => c.defect_id === d.id)
              .map((c) => ({ id: c.id, author: c.author, text: c.text, createdAt: c.created_at })),
          })),
        }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "forms" }, (payload) => {
        setState((s) => {
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
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => { void loadAll(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "defect_audit_log" }, (payload) => {
        const entry = rowToAudit(payload.new as AuditRow);
        setState((s) => ({ ...s, audit: [entry, ...s.audit] }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, (payload) => {
        setState((s) => {
          let next = s.notifications;
          if (payload.eventType === "INSERT") {
            const n = payload.new as NotifRow;
            next = [{
              id: n.id, type: n.type, title: n.title, body: n.body,
              defectId: n.defect_id, environment: (n.environment as Environment | null) ?? null,
              read: n.read, createdAt: n.created_at,
            }, ...next].slice(0, 200);
          } else if (payload.eventType === "UPDATE") {
            const n = payload.new as NotifRow;
            next = next.map((x) => x.id === n.id ? { ...x, read: n.read } : x);
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id: string }).id;
            next = next.filter((x) => x.id !== oldId);
          }
          return { ...s, notifications: next };
        });
      })
      .subscribe();

    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [state.currentUser?.id]);

  const requireUser = () => {
    const u = state.currentUser;
    if (!u) throw new Error("Not authenticated");
    return u;
  };

  const ctx: Ctx = {
    ...state,
    login: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    signup: async (name, email, password) => {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { name }, emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    logout: async () => { await supabase.auth.signOut(); },

    addDefect: async (d) => {
      const me = requireUser();
      const id = `DEF-${1000 + Math.floor(Date.now() % 100000)}`;
      const { error } = await supabase.from("defects").insert({
        id, module: d.module, form_feature: d.formFeature, title: d.title,
        description: d.description, steps_to_reproduce: d.stepsToReproduce,
        expected_result: d.expectedResult, actual_result: d.actualResult,
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
        status: d.status, priority: d.priority, severity: d.severity,
        assigned_agent: d.assignedAgent, created_by: me.name, updated_by: me.name,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    updateDefect: async (id, patch) => {
      const me = requireUser();
      const local = state.defects.find((d) => d.id === id);
      if (!local) return { ok: false, error: "Defect not found" };
      const dbPatch: Record<string, unknown> = { updated_by: me.name };
      const map: Record<string, string> = {
        module: "module", formFeature: "form_feature", title: "title",
        description: "description", stepsToReproduce: "steps_to_reproduce",
        expectedResult: "expected_result", actualResult: "actual_result",
        attachmentUrl: "attachment_url", attachmentUrl2: "attachment_url2",
        evidenceUrl: "evidence_url", screenshotUrl: "screenshot_url",
        videoUrl: "video_url", excelUrl: "excel_url", driveUrl: "drive_url",
        jiraUrl: "jira_url", validity: "validity",
        environment: "environment",
        status: "status", priority: "priority", severity: "severity",
        assignedAgent: "assigned_agent",
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
      if (error) return { ok: false, error: error.message };
      if (!data) {
        // Optimistic lock conflict: fetch latest and surface
        const { data: latest } = await supabase.from("defects").select("*").eq("id", id).maybeSingle();
        if (latest) {
          setState((s) => ({
            ...s,
            defects: s.defects.map((d) => (d.id === id ? rowToDefect(latest as DefectRow, commentsRef.current) : d)),
          }));
        }
        toast.error("Conflict: another agent updated this defect. Latest values were loaded.");
        return { ok: false, conflict: true, error: "Version conflict" };
      }
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
      if (trimmed.length > 2000) return { ok: false, error: "Comment is too long (max 2000 characters)" };
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
      if (trimmed.length > 2000) return { ok: false, error: "Comment is too long (max 2000 characters)" };
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
        await supabase.from("user_roles").delete().eq("user_id", id);
        const { error } = await supabase.from("user_roles").insert({ user_id: id, role: patch.role });
        if (error) return { ok: false, error: error.message };
      }
      const profilePatch: Record<string, unknown> = {};
      if (patch.name !== undefined) profilePatch.name = patch.name;
      if (patch.active !== undefined) profilePatch.active = patch.active;
      if (Object.keys(profilePatch).length) {
        const { error } = await supabase.from("profiles").update(profilePatch as never).eq("id", id);
        if (error) return { ok: false, error: error.message };
      }
      return { ok: true };
    },
    removeUser: async () => ({ ok: false, error: "User removal must be performed by an administrator from the backend." }),

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
      const { error } = await supabase.from("forms").update(dbPatch as never).eq("id", id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    addForm: async (f) => {
      const id = `F-${Date.now()}`;
      const { error } = await supabase.from("forms").insert({
        id, name: f.name, module: f.module, status: f.status,
        passed: f.passed, failed: f.failed, open_defects: f.openDefects,
        last_tested: f.lastTested, assigned_agent: f.assignedAgent,
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
