import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

/**
 * Apply filters on the Reported Errors page, run the CSV/Excel export, then
 * read the downloaded file and verify that the row set matches the on-screen
 * filtered rows (same count, same IDs).
 *
 * Skips when admin creds are not configured — exports require admin or the
 * `allow_agent_exports` runtime flag, and admin is the deterministic path.
 */

const ADMIN = {
  email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        cur.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (field.length || cur.length) {
          cur.push(field);
          rows.push(cur);
          cur = [];
          field = "";
        }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else field += c;
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

test.describe("Defects filter → CSV export integrity", () => {
  test("exported file rows match visible filtered rows", async ({ page }) => {
    test.skip(!ADMIN.email || !ADMIN.password, "admin creds not configured");
    await login(page, ADMIN.email!, ADMIN.password!);

    await page.goto("/my-reported-errors");
    await expect(page.getByRole("heading", { name: /reported errors/i })).toBeVisible();

    // Apply a narrow filter combo: status=Reported. Skip when the option is
    // not selectable in this environment (no seed data).
    const statusTrigger = page.getByRole("combobox").filter({ hasText: /status|all statuses/i }).first();
    if (await statusTrigger.count()) {
      await statusTrigger.click();
      const opt = page.getByRole("option", { name: "Reported" });
      if (await opt.count()) await opt.click();
      else await page.keyboard.press("Escape");
    }

    // Collect visible IDs from the table (monospace ID column).
    const idCells = page.locator("table tbody tr td.font-mono");
    await page.waitForTimeout(300);
    const visibleCount = await idCells.count();
    test.skip(visibleCount === 0, "no rows to export under this filter");
    const visibleIds = (await idCells.allInnerTexts()).map((t) => t.trim());

    // Open export dialog and run job.
    const exportBtn = page.getByRole("button", { name: /export/i }).first();
    test.skip(!(await exportBtn.count()), "export action not available for this account");
    await exportBtn.click();
    await expect(page.getByRole("dialog", { name: /export reported errors/i })).toBeVisible();
    await page.getByRole("button", { name: /run as background job/i }).click();

    // Wait for completion, then trigger download.
    const downloadBtn = page.getByRole("button", { name: /^download$/i });
    await expect(downloadBtn).toBeEnabled({ timeout: 30_000 });
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadBtn.click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();

    const text = readFileSync(path!, "utf8");
    const rows = parseCsv(text);
    expect(rows.length).toBeGreaterThan(0);
    const header = rows[0];
    const data = rows.slice(1).filter((r) => r.some((c) => c.length));

    // Same row count as visible filtered rows.
    expect(data.length).toBe(visibleIds.length);

    // Same ID set. The export header contains an "ID"/"Defect ID" column.
    const idIdx = header.findIndex((h) => /(^|\s)id$/i.test(h) || /defect id/i.test(h));
    if (idIdx >= 0) {
      const exportedIds = data.map((r) => r[idIdx].trim()).sort();
      expect(exportedIds).toEqual([...visibleIds].sort());
    }
  });
});
