import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * E2E coverage for the agent header DeadlineCountdown when assignments are
 * Completed or have an expired / cleared deadline. In both cases the row
 * MUST drop out of the active list and the indicator MUST collapse back to
 * the green empty-state pill (no popover trigger, no count badge).
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

/**
 * Installs a mutable fixture: the array returned to the page can be swapped
 * between calls by assigning a new value to `state.rows` — every subsequent
 * REST read picks it up, which is how we simulate a Completed transition.
 */
async function installMutableRetestFixture(page: Page) {
  const state: { rows: Row[] } = { rows: [] };
  const handle = async (route: Route) => {
    const url = route.request().url();
    if (url.includes("/rest/v1/retest_assignments")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.rows),
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
  return state;
}

async function gotoDashboard(page: Page) {
  await page.evaluate(() => window.localStorage.setItem("zenwork.env", "Production"));
  await page.goto("/dashboard");
}

function expectEmptyIndicator(page: Page) {
  return Promise.all([
    expect(page.getByLabel("No active deadlines")).toBeVisible(),
    expect(page.locator("button[aria-label*='active deadline']")).toHaveCount(0),
  ]);
}

test.describe("DeadlineCountdown — completed and expired deadlines", () => {
  test.beforeEach(({ }, testInfo) => {
    testInfo.skip(!AGENT.email || !AGENT.password, "agent creds not configured");
  });

  test("completed rows and null-deadline (expired) rows are excluded from active", async ({
    page,
  }) => {
    await login(page, AGENT.email!, AGENT.password!);
    const agentId = await readAgentUserId(page);
    const state = await installMutableRetestFixture(page);

    const now = Date.now();
    state.rows = [
      {
        id: "done-1",
        title: "Completed retest of 990-PF",
        module: "Forms",
        priority: "High",
        // Past-due timestamp on a Completed row must NOT show as overdue.
        status: "Completed",
        deadline_at: new Date(now - 2 * 60 * 60_000).toISOString(),
        assigned_agent_id: agentId,
        environment: "Production",
        created_at: new Date(now - 5000).toISOString(),
      },
      {
        id: "done-2",
        title: "Completed W-9 import audit",
        module: "1099",
        priority: "Medium",
        status: "Completed",
        deadline_at: new Date(now + 3 * 60 * 60_000).toISOString(),
        assigned_agent_id: agentId,
        environment: "Production",
        created_at: new Date(now - 4000).toISOString(),
      },
      {
        id: "expired-1",
        title: "Deadline cleared by admin",
        module: "Knowledge Base",
        priority: "Low",
        status: "Open",
        deadline_at: null,
        assigned_agent_id: agentId,
        environment: "Production",
        created_at: new Date(now - 3000).toISOString(),
      },
    ];

    await gotoDashboard(page);
    await expectEmptyIndicator(page);

    // No popover, so no listitem can leak any of these titles.
    await expect(page.getByText("Completed retest of 990-PF")).toHaveCount(0);
    await expect(page.getByText("Deadline cleared by admin")).toHaveCount(0);
  });

  test("indicator clears after the sole active deadline is marked Completed", async ({
    page,
  }) => {
    await login(page, AGENT.email!, AGENT.password!);
    const agentId = await readAgentUserId(page);
    const state = await installMutableRetestFixture(page);

    const now = Date.now();
    const activeRow: Row = {
      id: "active-then-done",
      title: "Verify export pipeline",
      module: "Reports",
      priority: "High",
      status: "In Progress",
      deadline_at: new Date(now + 45 * 60_000).toISOString(),
      assigned_agent_id: agentId,
      environment: "Production",
      created_at: new Date(now - 1000).toISOString(),
    };
    state.rows = [activeRow];

    await gotoDashboard(page);

    // Baseline: indicator shows the single active deadline.
    const trigger = page.locator("button[aria-label^='1 active deadline,']");
    await expect(trigger).toBeVisible();

    // Mark Completed and force a refetch. The store's loader runs on mount
    // and on realtime events, so a navigation away + back is the most
    // deterministic way to trigger a re-read against the mocked endpoint.
    state.rows = [{ ...activeRow, status: "Completed" }];
    await page.goto("/profile");
    await page.goto("/dashboard");

    await expectEmptyIndicator(page);
    // The "1 active deadline" trigger is gone.
    await expect(page.locator("button[aria-label^='1 active deadline,']")).toHaveCount(0);
  });
});