import { test, expect, type Page } from "@playwright/test";
import { loginAgent } from "./agent-theme-helpers";

const ADMIN = {
  email: process.env.PLAYWRIGHT_ADMIN_EMAIL,
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD,
};

async function loginAdmin(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).fill(ADMIN.email!);
  await page.getByLabel(/password/i).fill(ADMIN.password!);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|select-environment)/);
}

/**
 * Reads the visible first-name chip from the top-right account button.
 * The chip is the only descendant <span> inside the account-menu trigger
 * that carries the rendered text (skeleton placeholder is aria-hidden).
 */
async function readHeaderName(page: Page): Promise<string> {
  const trigger = page.getByRole("button", { name: /open account menu/i });
  await expect(trigger).toBeVisible();
  // The visible label is the trimmed text of the trigger button.
  return ((await trigger.innerText()) || "").trim();
}

/** Open the account dropdown and read the full name shown in the label. */
async function readDropdownFullName(page: Page): Promise<string> {
  await page.getByRole("button", { name: /open account menu/i }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const fullName = ((await menu.locator("div.font-medium").first().innerText()) || "").trim();
  // Close the menu to avoid leaking state into the next assertion.
  await page.keyboard.press("Escape");
  return fullName;
}

async function readProfilePageFullName(page: Page): Promise<string> {
  await page.goto("/profile");
  // Profile page input/label exposes the stored full name.
  const nameField = page
    .getByLabel(/full name|display name|name/i)
    .first();
  await expect(nameField).toBeVisible();
  const value = await nameField.inputValue().catch(() => "");
  return (value || "").trim();
}

test.describe("Header shows first name; profile shows full name", () => {
  test.skip(
    !process.env.PLAYWRIGHT_AGENT_EMAIL || !process.env.PLAYWRIGHT_ADMIN_EMAIL,
    "Requires PLAYWRIGHT_*_EMAIL/PASSWORD env vars",
  );

  for (const role of ["admin", "agent"] as const) {
    test(`${role}: header chip is first name only, profile page keeps full name`, async ({
      page,
    }) => {
      if (role === "admin") await loginAdmin(page);
      else await loginAgent(page);

      // Header should never be blank — fallback is at least an account label.
      const headerName = await readHeaderName(page);
      expect(headerName.length).toBeGreaterThan(0);

      // Dropdown label shows the full stored name.
      const dropdownFullName = await readDropdownFullName(page);
      expect(dropdownFullName.length).toBeGreaterThan(0);

      // The header chip must be a single token (no spaces),
      // and must equal the first whitespace-separated token of the full name.
      expect(headerName.includes(" ")).toBe(false);
      const firstToken = dropdownFullName.split(/\s+/)[0];
      expect(headerName).toBe(firstToken);

      // Profile page preserves the full name (must match dropdown / stored value).
      const profileFullName = await readProfilePageFullName(page);
      // Profile field may include the full name verbatim.
      expect(profileFullName).toBe(dropdownFullName);
    });
  }
});