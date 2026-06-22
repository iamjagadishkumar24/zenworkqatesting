import { describe, it, expect } from "vitest";
import { renderTaskAssignmentEmail, renderRetestAssignmentEmail } from "./emailTemplates";

const base = {
  agentName: "Alice",
  assignedBy: "Admin",
  taskTitle: "Verify NEC totals",
  taskId: "TASK-2026-01",
  module: "1099 Forms",
  priority: "High",
  dueDate: "2026-02-01",
  instructions: "Steps: do x.",
  environment: "Production",
  appUrl: "https://app.example.com/",
};

describe("renderTaskAssignmentEmail", () => {
  it("uses the task title in the subject when present", () => {
    expect(renderTaskAssignmentEmail(base).subject).toBe("New task assigned: Verify NEC totals");
  });

  it("falls back to taskId when title is empty", () => {
    expect(renderTaskAssignmentEmail({ ...base, taskTitle: "" }).subject).toBe(
      "New task assigned: TASK-2026-01",
    );
  });

  it("strips trailing slash from appUrl and encodes the taskId", () => {
    const { html, text } = renderTaskAssignmentEmail({
      ...base,
      taskId: "TASK 2026/01",
      appUrl: "https://app.example.com/",
    });
    expect(html).toContain("https://app.example.com/tasks/TASK%202026%2F01");
    expect(text).toContain("https://app.example.com/tasks/TASK%202026%2F01");
  });

  it("escapes HTML in user-supplied fields", () => {
    const html = renderTaskAssignmentEmail({
      ...base,
      agentName: '<img src=x onerror="alert(1)">',
      taskTitle: 'A & B "quoted" <tag>',
      instructions: "<script>bad</script>",
    }).html;
    expect(html).not.toContain("<script>bad");
    expect(html).not.toContain("onerror=");
    expect(html).toContain("&lt;script&gt;bad&lt;/script&gt;");
    expect(html).toContain("A &amp; B &quot;quoted&quot; &lt;tag&gt;");
  });

  it("omits rows whose values are missing", () => {
    const html = renderTaskAssignmentEmail({
      ...base,
      module: undefined,
      priority: undefined,
      dueDate: null,
      instructions: undefined,
      environment: undefined,
    }).html;
    expect(html).not.toContain(">Module<");
    expect(html).not.toContain(">Priority<");
    expect(html).not.toContain(">Due date<");
    expect(html).not.toContain(">Environment<");
    // Always present
    expect(html).toContain(">Task<");
    expect(html).toContain(">Assigned by<");
  });

  it("uses 'there' when agentName is empty", () => {
    const { html, text } = renderTaskAssignmentEmail({ ...base, agentName: "" });
    expect(html).toContain("Hi there,");
    expect(text.startsWith("Hi there,")).toBe(true);
  });

  it("includes the open-task CTA link", () => {
    const { html } = renderTaskAssignmentEmail(base);
    expect(html).toMatch(/<a [^>]*href="https:\/\/app\.example\.com\/tasks\/TASK-2026-01"/);
    expect(html).toContain("Open task");
  });
});

describe("renderRetestAssignmentEmail", () => {
  it("changes only the subject vs the task email", () => {
    const a = renderTaskAssignmentEmail(base);
    const b = renderRetestAssignmentEmail(base);
    expect(b.subject).toBe("Retest assigned: Verify NEC totals");
    expect(b.html).toBe(a.html);
    expect(b.text).toBe(a.text);
  });
});