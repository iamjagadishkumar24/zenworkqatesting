import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * End-to-end coverage for the agent header DeadlineCountdown:
 *  - no active deadlines  → green "No Active Deadlines" pill
 *  - exactly one          → single timer pill, no count badge
 *  - multiple w/ overdue  → stacked timer + count badge, popover lists
 *    every assignment sorted with overdue first, overdue row highlighted,
 *    and each row links to /tasks/$taskId for quick navigation.
 *
 * Data is injected by intercepting the Supabase REST reads issued by
 * useRetests() so the test does not depend on shared DB state.
 */

const AGENT = {
  email: process.env.PLAYWRIGHT_AGENT_EMAIL,
  password: process.env.PLAYWRIGHT_AGENT_PASSWORD,
};

const PROJECT_REF = "hpbxwntqnmpdwzgozujs";
const SUPABASE_AUTH_KEY = `sb-${PROJECT_REF}-auth-token`;

type Row = {
  id: string;
  title: string;
  module: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  status: string;
  deadline_at: string | null;
  assigned_agent_id: string;
  environment: "Production" | "Stage";
  created_at: string;
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

async function readAgentUserId(page: Page): Promise<string> {
  return await page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) throw new Error("supabase auth token missing");
    const parsed = JSON.parse(raw) as { user?: { id?: string } };
    if (!parsed?.user?.id) throw new Error("supabase user id missing");
    return parsed.user.id;
  }, SUPABASE_AUTH_KEY);
}

async function installRetestFixture(page: Page, rows: Row[]) {
  const handle = async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/rest/v1/retest_assignments")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rows),
      });
      return;
    }
    if (url.includes("/rest/v1/retest_assignment_forms")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
      return;
    }
    await route.fallback();
  };
  await page.route(/\/rest\/v1\/retest_assignments(\?|$)/, handle);
  await page.route(/\/rest\/v1\/retest_assignment_forms(\?|$)/, handle);
}

async function gotoDashboard(page: Page) {
  await page.evaluate(() => window.localStorage.setItem("zenwork.env", "Production"));
  await page.goto("/dashboard");
}

test.describe("DeadlineCountdown — active deadline states", () => {
  test.beforeEach(({ }, testInfo) => {
    testInfo.skip(!AGENT.email || !AGENT.password, "agent creds not configured");
  });

  test("no active deadlines renders the empty-state pill", async ({ page }) => {
    await login(page, AGENT.email!, AGENT.password!);
    const agentId = await readAgentUserId(page);
    await installRetestFixture(page, []);
    void agentId;
    await gotoDashboard(page);

    const pill = page.getByLabel("No active deadlines");
    await expect(pill).toBeVisible();
    // Empty state must not render a popover trigger.
    await expect(page.locator("button[aria-label*='active deadline']")).toHaveCount(0);
  });

  test("a single active deadline renders without a count badge", async ({ page }) => {
    await login(page, AGENT.email!, AGENT.password!);
    const agentId = await readAgentUserId(page);
    const inOneHour = new Date(Date.now() + 60 * 60_000 + 30_000).toISOString();
    await installRetestFixture(page, [
      {
        id: "single-1",
        title: "Verify 990-T schedule export",
        module: "Forms",
        priority: "High",
        status: "In Progress",
        deadline_at: inOneHour,
        assigned_agent_id: agentId,
        environment: "Production",
        created_at: new Date().toISOString(),
      },
    ]);
    await gotoDashboard(page);

    const trigger = page.locator("button[aria-label^='1 active deadline,']");
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText(/Left/);
    // No count badge text "1 ·" pattern when single.
    await expect(trigger).not.toContainText(/Active Deadlines/);

    await trigger.click();
    const list = page.getByRole("list", { name: /active deadlines/i });
    await expect(list).toBeVisible();
    const items = list.getByRole("listitem");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Verify 990-T schedule export");

    // Quick navigation: clicking the row routes to the task page.
    await items.first().click();
    await expect(page).toHaveURL(/\/tasks\/single-1$/);
  });

  test("multiple deadlines: overdue highlighted, sorted by urgency, links navigate", async ({
    page,
  }) => {
    await login(page, AGENT.email!, AGENT.password!);
    const agentId = await readAgentUserId(page);

    const now = Date.now();
    const overdueAt = new Date(now - 2 * 60 * 60_000).toISOString(); // 2h overdue
    const soonAt = new Date(now + 30 * 60_000).toISOString();       // 30m left
    const laterAt = new Date(now + 5 * 60 * 60_000).toISOString();  // 5h left

    const rows: Row[] = [
      {
        id: "task-soon",
        title: "Reproduce W-9 import bug",
        module: "1099",
        priority: "High",
        status: "Open",
        deadline_at: soonAt,
        assigned_agent_id: agentId,
        environment: "Production",
        created_at: new Date(now - 1000).toISOString(),
      },
      {
        id: "task-later",
        title: "Validate Knowledge Base search",
        module: "Knowledge Base",
        priority: "Medium",
        status: "In Progress",
        deadline_at: laterAt,
        assigned_agent_id: agentId,
        environment: "Production",
        created_at: new Date(now - 2000).toISOString(),
      },
      {
        id: "task-overdue",
        title: "Confirm 990-PF schedules persist",
        module: "Forms",
        priority: "Critical",
        status: "Open",
        deadline_at: overdueAt,
        assigned_agent_id: agentId,
        environment: "Production",
        created_at: new Date(now - 3000).toISOString(),
      },
    ];
    await installRetestFixture(page, rows);
    await gotoDashboard(page);

    const trigger = page.locator("button[aria-label^='3 active deadlines,']");
    await expect(trigger).toBeVisible();
    // Multi-state shows the count chip and the "Active Deadlines" label.
    await expect(trigger).toContainText(/3\s+Active Deadlines/);

    await trigger.click();
    const list = page.getByRole("list", { name: /active deadlines/i });
    await expect(list).toBeVisible();

    // The header chip near the popover title reports 1 overdue.
    await expect(page.getByText(/1 overdue/i)).toBeVisible();

    const items = list.getByRole("listitem");
    await expect(items).toHaveCount(3);

    // Urgency sort: overdue first, then 30m, then 5h.
    await expect(items.nth(0)).toContainText("Confirm 990-PF schedules persist");
    await expect(items.nth(1)).toContainText("Reproduce W-9 import bug");
    await expect(items.nth(2)).toContainText("Validate Knowledge Base search");

    // Overdue row is visually highlighted (bg-red-500/5 utility).
    await expect(items.nth(0)).toHaveClass(/bg-red-500/);
    await expect(items.nth(1)).not.toHaveClass(/bg-red-500\/5/);

    // Overdue badge text uses the "+Xh Ym" leading-plus marker.
    await expect(items.nth(0)).toContainText(/\+\d{2}h \d{2}m/);

    // Quick navigation: clicking the most-urgent row goes to its task page.
    await items.nth(0).click();
    await expect(page).toHaveURL(/\/tasks\/task-overdue$/);
  });
});