/**
 * Email notification server functions.
 *
 * Design goals:
 *  - Frontend never sends email — it only invokes a server function.
 *  - Provider/credentials are read from environment variables at call time.
 *  - If no provider is configured, the function NO-OPS gracefully:
 *    it logs the email to `email_log` with status="not_configured" and
 *    returns `{ configured: false, sent: 0 }`. It never throws so the
 *    business action (task assignment, etc.) still succeeds.
 *  - Supported providers (any one of these envs enables sending):
 *      EMAIL_PROVIDER = "resend"   + RESEND_API_KEY  + EMAIL_FROM
 *      EMAIL_PROVIDER = "sendgrid" + SENDGRID_API_KEY + EMAIL_FROM
 *      EMAIL_PROVIDER = "ses"      + AWS_SES_REGION + AWS_ACCESS_KEY_ID +
 *                                    AWS_SECRET_ACCESS_KEY + EMAIL_FROM
 *      EMAIL_PROVIDER = "smtp"     + SMTP_HOST/PORT/USER/PASS + EMAIL_FROM
 *        (SMTP requires an external relay; on the Worker runtime we log
 *         it as "not_configured" and let an external worker pick it up.)
 *  - Optional: APP_URL — base URL used in email links (defaults to the
 *    Supabase project URL host).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  renderTaskAssignmentEmail,
  renderRetestAssignmentEmail,
  type TaskAssignmentEmailInput,
} from "./emailTemplates";
import type { Database } from "@/integrations/supabase/types";

type Json = Database["public"]["Tables"]["email_log"]["Insert"]["payload"];
const toJson = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json;

type ProviderResult = { provider: string; status: "sent" | "failed"; error?: string };

function pickAppUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.VITE_PUBLIC_APP_URL ||
    "https://zenworkqatesting.lovable.app"
  );
}

function pickProvider(): string | null {
  const p = (process.env.EMAIL_PROVIDER || "").toLowerCase().trim();
  if (p === "resend" && process.env.RESEND_API_KEY) return "resend";
  if (p === "sendgrid" && process.env.SENDGRID_API_KEY) return "sendgrid";
  if (
    p === "ses" &&
    process.env.AWS_SES_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  )
    return "ses";
  if (p === "smtp" && process.env.SMTP_HOST) return "smtp";
  // Auto-detect when EMAIL_PROVIDER is unset but a key is present.
  if (!p) {
    if (process.env.RESEND_API_KEY) return "resend";
    if (process.env.SENDGRID_API_KEY) return "sendgrid";
  }
  return null;
}

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<ProviderResult> {
  const from = process.env.EMAIL_FROM;
  if (!from) return { provider: "resend", status: "failed", error: "EMAIL_FROM not set" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return { provider: "resend", status: "failed", error: `HTTP ${r.status}: ${body.slice(0, 200)}` };
    }
    return { provider: "resend", status: "sent" };
  } catch (e) {
    return { provider: "resend", status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

async function sendViaSendgrid(to: string, subject: string, html: string, text: string): Promise<ProviderResult> {
  const from = process.env.EMAIL_FROM;
  if (!from) return { provider: "sendgrid", status: "failed", error: "EMAIL_FROM not set" };
  try {
    const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return { provider: "sendgrid", status: "failed", error: `HTTP ${r.status}: ${body.slice(0, 200)}` };
    }
    return { provider: "sendgrid", status: "sent" };
  } catch (e) {
    return { provider: "sendgrid", status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

async function dispatch(provider: string, to: string, subject: string, html: string, text: string): Promise<ProviderResult> {
  if (provider === "resend") return sendViaResend(to, subject, html, text);
  if (provider === "sendgrid") return sendViaSendgrid(to, subject, html, text);
  // SES / SMTP require additional adapters not safe in the Worker runtime —
  // record the intent so an external worker / cron can pick it up later.
  return { provider, status: "failed", error: `${provider} not implemented in-runtime; queued in email_log` };
}

type RecipientInput = { email: string; name?: string };

const RecipientSchema = z.object({ email: z.string().email(), name: z.string().optional() });

const TaskInputSchema = z.object({
  recipients: z.array(RecipientSchema).min(1).max(50),
  task: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    module: z.string().optional(),
    testingType: z.string().optional(),
    priority: z.string().optional(),
    dueDate: z.string().nullish(),
    instructions: z.string().optional(),
    environment: z.string().optional(),
  }),
});

async function recordAndSend(
  supabaseAdmin: Awaited<ReturnType<typeof getAdmin>>,
  template: "task_assignment" | "retest_assignment",
  payload: TaskAssignmentEmailInput,
  recipient: RecipientInput,
  triggeredBy: { id: string; name: string },
  provider: string | null,
): Promise<{ status: string; error?: string }> {
  const rendered =
    template === "retest_assignment"
      ? renderRetestAssignmentEmail(payload)
      : renderTaskAssignmentEmail(payload);

  if (!provider) {
    await supabaseAdmin.from("email_log").insert({
      to_email: recipient.email,
      to_name: recipient.name ?? null,
      subject: rendered.subject,
      template,
      provider: "none",
      status: "not_configured",
      related_task_id: payload.taskId,
      triggered_by_id: triggeredBy.id,
      triggered_by_name: triggeredBy.name,
      payload: toJson(payload),
    });
    return { status: "not_configured" };
  }

  const result = await dispatch(provider, recipient.email, rendered.subject, rendered.html, rendered.text);
  await supabaseAdmin.from("email_log").insert({
    to_email: recipient.email,
    to_name: recipient.name ?? null,
    subject: rendered.subject,
    template,
    provider: result.provider,
    status: result.status,
    error: result.error ?? null,
    related_task_id: payload.taskId,
    triggered_by_id: triggeredBy.id,
    triggered_by_name: triggeredBy.name,
    payload: toJson(payload),
    sent_at: result.status === "sent" ? new Date().toISOString() : null,
  });
  return { status: result.status, error: result.error };
}

async function getAdmin() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

/**
 * Notify one or more agents that a task was assigned to them.
 * Returns { configured, sent, failed } — never throws on send failure so
 * the caller's UI flow (assignment) stays unaffected.
 */
export const sendTaskAssignmentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof TaskInputSchema>) => TaskInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", userId)
      .maybeSingle();
    const triggeredBy = { id: userId, name: profile?.name ?? "" };
    const provider = pickProvider();
    const appUrl = pickAppUrl();
    const supabaseAdmin = await getAdmin();

    let sent = 0;
    let failed = 0;
    for (const r of data.recipients) {
      try {
        const res = await recordAndSend(
          supabaseAdmin,
          "task_assignment",
          {
            agentName: r.name ?? "",
            assignedBy: triggeredBy.name,
            taskTitle: data.task.title,
            taskId: data.task.id,
            module: data.task.module,
            testingType: data.task.testingType,
            priority: data.task.priority,
            dueDate: data.task.dueDate ?? null,
            instructions: data.task.instructions,
            environment: data.task.environment,
            appUrl,
          },
          r,
          triggeredBy,
          provider,
        );
        if (res.status === "sent") sent++;
        else if (res.status === "failed") failed++;
      } catch {
        failed++;
      }
    }
    return { configured: provider !== null, provider: provider ?? "none", sent, failed, total: data.recipients.length };
  });

/** Same shape, retest template. */
export const sendRetestAssignmentEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof TaskInputSchema>) => TaskInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", userId)
      .maybeSingle();
    const triggeredBy = { id: userId, name: profile?.name ?? "" };
    const provider = pickProvider();
    const appUrl = pickAppUrl();
    const supabaseAdmin = await getAdmin();

    let sent = 0;
    let failed = 0;
    for (const r of data.recipients) {
      const res = await recordAndSend(
        supabaseAdmin,
        "retest_assignment",
        {
          agentName: r.name ?? "",
          assignedBy: triggeredBy.name,
          taskTitle: data.task.title,
          taskId: data.task.id,
          module: data.task.module,
          testingType: data.task.testingType,
          priority: data.task.priority,
          dueDate: data.task.dueDate ?? null,
          instructions: data.task.instructions,
          environment: data.task.environment,
          appUrl,
        },
        r,
        triggeredBy,
        provider,
      );
      if (res.status === "sent") sent++;
      else if (res.status === "failed") failed++;
    }
    return { configured: provider !== null, provider: provider ?? "none", sent, failed, total: data.recipients.length };
  });

/** Lightweight status helper for UIs that want to surface config state. */
export const getEmailConfigStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ configured: pickProvider() !== null, provider: pickProvider() ?? "none" }));