/**
 * Email content templates. Pure functions that return subject + html + text.
 * No provider/IO here — safe to import anywhere.
 */

export type TaskAssignmentEmailInput = {
  agentName: string;
  assignedBy: string;
  taskTitle: string;
  taskId: string;
  module?: string;
  testingType?: string;
  priority?: string;
  dueDate?: string | null;
  instructions?: string;
  environment?: string;
  appUrl: string; // base URL of the portal
};

export type RetestAssignmentEmailInput = TaskAssignmentEmailInput;

function escape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <tr><td style="padding:20px 24px;background:#0f172a;color:#fff;font-weight:600;font-size:16px">Zenwork Testing Portal</td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 12px 0;font-size:18px;color:#0f172a">${escape(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:14px 24px;background:#f8fafc;color:#64748b;font-size:12px">You're receiving this because you have an account in the Zenwork Testing Portal.</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export function renderTaskAssignmentEmail(input: TaskAssignmentEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const link = `${input.appUrl.replace(/\/$/, "")}/tasks/${encodeURIComponent(input.taskId)}`;
  const subject = `New task assigned: ${input.taskTitle || input.taskId}`;
  const rows: [string, string | undefined][] = [
    ["Task", input.taskTitle || input.taskId],
    ["Module", input.module],
    ["Testing type", input.testingType],
    ["Priority", input.priority],
    ["Environment", input.environment],
    ["Due date", input.dueDate || undefined],
    ["Assigned by", input.assignedBy],
  ];
  const rowsHtml = rows
    .filter(([, v]) => !!v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px;width:120px">${escape(k)}</td><td style="padding:6px 12px;font-size:13px;color:#0f172a">${escape(v as string)}</td></tr>`,
    )
    .join("");
  const instructions = input.instructions
    ? `<div style="margin-top:16px;padding:12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#0f172a;white-space:pre-wrap">${escape(input.instructions)}</div>`
    : "";
  const body = `
    <p style="margin:0 0 12px 0;font-size:14px">Hi ${escape(input.agentName || "there")},</p>
    <p style="margin:0 0 16px 0;font-size:14px">A new task has been assigned to you.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate">${rowsHtml}</table>
    ${instructions}
    <p style="margin:20px 0 0 0">
      <a href="${escape(link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Open task</a>
    </p>
    <p style="margin:16px 0 0 0;font-size:12px;color:#64748b">Or copy this link: ${escape(link)}</p>
  `;
  const text = [
    `Hi ${input.agentName || "there"},`,
    ``,
    `A new task has been assigned to you.`,
    ``,
    ...rows.filter(([, v]) => !!v).map(([k, v]) => `${k}: ${v}`),
    input.instructions ? `\nInstructions:\n${input.instructions}` : "",
    ``,
    `Open task: ${link}`,
  ].join("\n");
  return { subject, html: shell("New task assigned", body), text };
}

export function renderRetestAssignmentEmail(input: RetestAssignmentEmailInput) {
  const base = renderTaskAssignmentEmail(input);
  return {
    ...base,
    subject: `Retest assigned: ${input.taskTitle || input.taskId}`,
  };
}