import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildReportedErrorsWorkbook, buildReportedErrorsFilename } from "./exportReportedErrors";
import type { Defect, Environment } from "./types";
import type { Database } from "@/integrations/supabase/types";

type Json = NonNullable<Database["public"]["Tables"]["export_jobs"]["Insert"]["filters"]>;
const toJson = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json;

const FiltersSchema = z.object({
  environment: z.enum(["Production", "Stage"]).nullable().optional(),
  module: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  severity: z.string().optional(),
  assignedAgent: z.string().optional(),
  reporter: z.string().optional(),
  q: z.string().optional(),
});
export type ExportFilters = z.infer<typeof FiltersSchema>;

function matches(d: Defect, f: ExportFilters, isAdmin: boolean, userName: string): boolean {
  if (!isAdmin && d.createdBy !== userName) return false;
  if (f.environment && d.environment && d.environment !== f.environment) return false;
  if (f.module && f.module !== "all" && d.module !== f.module) return false;
  if (f.status && f.status !== "all" && d.status !== f.status) return false;
  if (f.priority && f.priority !== "all" && d.priority !== f.priority) return false;
  if (f.severity && f.severity !== "all" && d.severity !== f.severity) return false;
  if (f.assignedAgent && f.assignedAgent !== "all" && d.assignedAgent !== f.assignedAgent) return false;
  if (f.reporter && f.reporter !== "all" && d.createdBy !== f.reporter) return false;
  if (f.q) {
    const t = f.q.trim().toLowerCase();
    if (t) {
      const hay = [d.id, d.title, d.formFeature, d.module, d.status, d.priority, d.severity, d.assignedAgent, d.createdBy].join(" ").toLowerCase();
      if (!hay.includes(t)) return false;
    }
  }
  return true;
}

function dbRowToDefect(row: Record<string, unknown>): Defect {
  const r = row as Record<string, string | null>;
  return {
    id: String(r.id ?? ""),
    module: String(r.module ?? "") as Defect["module"],
    formFeature: String(r.form_feature ?? ""),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    stepsToReproduce: String(r.steps_to_reproduce ?? ""),
    expectedResult: String(r.expected_result ?? ""),
    actualResult: String(r.actual_result ?? ""),
    attachmentUrl: r.attachment_url ?? undefined,
    attachmentUrl2: r.attachment_url2 ?? undefined,
    evidenceUrl: r.evidence_url ?? undefined,
    screenshotUrl: r.screenshot_url ?? undefined,
    videoUrl: r.video_url ?? undefined,
    excelUrl: r.excel_url ?? undefined,
    driveUrl: r.drive_url ?? undefined,
    jiraUrl: r.jira_url ?? undefined,
    status: String(r.status ?? "Reported") as Defect["status"],
    priority: String(r.priority ?? "Medium") as Defect["priority"],
    severity: String(r.severity ?? "Medium") as Defect["severity"],
    validity: (r.validity as Defect["validity"]) ?? "Unverified",
    environment: (r.environment as Environment | undefined) ?? undefined,
    assignedAgent: String(r.assigned_agent ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    updatedBy: String(r.updated_by ?? ""),
    createdBy: String(r.created_by ?? ""),
    comments: [],
  };
}

async function loadAllowAgentExports(supabase: ReturnType<typeof Object>): Promise<boolean> {
  // typed loosely; supabase param is a SupabaseClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from("app_settings").select("value").eq("key", "allow_agent_exports").maybeSingle();
  return data?.value === true || data?.value === "true";
}

/** Enqueue + immediately process an export job. */
export const createExportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { filters: ExportFilters }) => ({
    filters: FiltersSchema.parse(data.filters),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    const userName = profile?.name ?? "";
    const role = isAdmin ? "admin" : "agent";

    if (!isAdmin) {
      const allowed = await loadAllowAgentExports(supabase);
      if (!allowed) throw new Error("Agent exports are disabled by the administrator.");
    }

    const filters = data.filters;
    const env = filters.environment ?? null;

    const { data: jobRow, error: jobErr } = await supabase
      .from("export_jobs")
      .insert({
        requested_by_id: userId,
        requested_by_name: userName,
        role,
        scope: "reported_errors",
        environment: env,
        filters: toJson(filters),
        status: "pending",
        progress: 0,
      })
      .select()
      .single();
    if (jobErr || !jobRow) throw new Error(jobErr?.message ?? "Failed to create export job");

    // Process inline; persist updates so client realtime sees progress.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      await supabaseAdmin.from("export_jobs").update({ status: "processing", progress: 10, updated_at: new Date().toISOString() }).eq("id", jobRow.id);

      // Apply env filter at the database for efficiency
      let query = supabaseAdmin.from("defects").select("*").order("created_at", { ascending: false });
      if (env) query = query.eq("environment", env);
      const { data: defectsRaw, error: dErr } = await query;
      if (dErr) throw new Error(dErr.message);

      const defects = (defectsRaw ?? []).map(dbRowToDefect).filter((d) => matches(d, filters, isAdmin, userName));

      await supabaseAdmin.from("export_jobs").update({ progress: 50, row_count: defects.length, updated_at: new Date().toISOString() }).eq("id", jobRow.id);

      const buf = buildReportedErrorsWorkbook(defects);
      const filename = buildReportedErrorsFilename(env);
      const filePath = `${userId}/${jobRow.id}/${filename}`;

      const { error: upErr } = await supabaseAdmin.storage.from("exports").upload(filePath, buf, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
      if (upErr) throw new Error(upErr.message);

      await supabaseAdmin.from("export_jobs").update({
        status: "completed",
        progress: 100,
        file_path: filePath,
        file_name: filename,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", jobRow.id);

      await supabaseAdmin.from("export_audit_log").insert({
        user_id: userId,
        user_name: userName,
        role,
        scope: "reported_errors",
        environment: env,
        filters: toJson(filters),
        row_count: defects.length,
        status: "success",
        job_id: jobRow.id,
      });

      return { jobId: jobRow.id, filePath, filename, rowCount: defects.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("export_jobs").update({
        status: "failed",
        error: msg,
        updated_at: new Date().toISOString(),
      }).eq("id", jobRow.id);
      await supabaseAdmin.from("export_audit_log").insert({
        user_id: userId,
        user_name: userName,
        role,
        scope: "reported_errors",
        environment: env,
        filters: toJson(filters),
        row_count: 0,
        status: "failed",
        error: msg,
        job_id: jobRow.id,
      });
      throw e;
    }
  });

/** Retry a failed job (admin only). */
export const retryExportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string }) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdminRow } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdminRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job, error } = await supabaseAdmin.from("export_jobs").select("*").eq("id", data.jobId).maybeSingle();
    if (error || !job) throw new Error("Job not found");

    const filters = FiltersSchema.parse((job.filters ?? {}) as ExportFilters);
    const env = (job.environment as Environment | null) ?? null;
    const ownerIsAdmin = job.role === "admin";
    const userName = job.requested_by_name;

    await supabaseAdmin.from("export_jobs").update({
      status: "processing", progress: 10, error: null,
      retries: (job.retries ?? 0) + 1, updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    try {
      let query = supabaseAdmin.from("defects").select("*").order("created_at", { ascending: false });
      if (env) query = query.eq("environment", env);
      const { data: defectsRaw, error: dErr } = await query;
      if (dErr) throw new Error(dErr.message);

      const defects = (defectsRaw ?? []).map(dbRowToDefect).filter((d) => matches(d, filters, ownerIsAdmin, userName));
      await supabaseAdmin.from("export_jobs").update({ progress: 50, row_count: defects.length, updated_at: new Date().toISOString() }).eq("id", job.id);

      const buf = buildReportedErrorsWorkbook(defects);
      const filename = buildReportedErrorsFilename(env);
      const filePath = `${job.requested_by_id}/${job.id}/${filename}`;
      const { error: upErr } = await supabaseAdmin.storage.from("exports").upload(filePath, buf, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", upsert: true,
      });
      if (upErr) throw new Error(upErr.message);

      await supabaseAdmin.from("export_jobs").update({
        status: "completed", progress: 100, file_path: filePath, file_name: filename,
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", job.id);

      return { jobId: job.id, filePath, filename, rowCount: defects.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("export_jobs").update({ status: "failed", error: msg, updated_at: new Date().toISOString() }).eq("id", job.id);
      throw e;
    }
  });

/** Issue a short-lived signed URL for downloading a completed export. */
export const getExportDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { jobId: string }) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: job, error } = await supabase.from("export_jobs").select("*").eq("id", data.jobId).maybeSingle();
    if (error || !job) throw new Error("Job not found");
    if (!job.file_path) throw new Error("Job not completed yet");
    const { data: isAdminRow } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdminRow && job.requested_by_id !== userId) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: sErr } = await supabaseAdmin.storage.from("exports").createSignedUrl(job.file_path, 60 * 5);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Failed to sign URL");
    return { url: signed.signedUrl, filename: job.file_name ?? "export.xlsx" };
  });

/** Admin-only: toggle the agent-exports setting. */
export const setAllowAgentExports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { allowed: boolean }) => z.object({ allowed: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdminRow } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdminRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_settings").upsert({
      key: "allow_agent_exports",
      value: toJson(data.allowed),
      updated_at: new Date().toISOString(),
      updated_by: userId,
    }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Log a direct (non-job) export from the client for the audit trail. */
export const logDirectExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { scope: string; environment: string | null; filters: Record<string, unknown>; rowCount: number; status: "success" | "failed"; error?: string }) =>
    z.object({
      scope: z.string(),
      environment: z.string().nullable(),
      filters: z.record(z.string(), z.unknown()),
      rowCount: z.number().int().nonnegative(),
      status: z.enum(["success", "failed"]),
      error: z.string().optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("name").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const role = (roles ?? []).some((r) => r.role === "admin") ? "admin" : "agent";
    await supabase.from("export_audit_log").insert({
      user_id: userId,
      user_name: profile?.name ?? "",
      role,
      scope: data.scope,
      environment: data.environment,
      filters: toJson(data.filters),
      row_count: data.rowCount,
      status: data.status,
      error: data.error ?? null,
    });
    return { ok: true };
  });