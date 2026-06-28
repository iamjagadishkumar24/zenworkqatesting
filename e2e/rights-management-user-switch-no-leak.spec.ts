import { test, expect, type Page } from "@playwright/test";

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

/** Locate the Forms row's switch for a given action. */
function formsSwitch(page: Page, action: "view" | "create" | "edit" | "delete") {
  // aria-label = `${action} Forms for ${userName}`. Match the action prefix.
  return page
    .getByRole("row", { name: /^Forms/ })
    .getByRole("switch")
    .nth(action === "view" ? 0 : action === "create" ? 1 : action === "edit" ? 2 : 3);
}

async function pickUserType(page: Page, type: "Admin" | "Agent") {
  await page.getByRole("combobox", { name: /User type/i }).click();
  await page.getByRole("option", { name: new RegExp(`^${type}$`, "i") }).click();
}

async function listUserOptions(page: Page): Promise<string[]> {
  await page.getByRole("combobox", { name: /^User$/ }).click();
  const labels = await page.getByRole("option").allTextContents();
  // Close the dropdown without changing selection.
  await page.keyboard.press("Escape");
  return labels.map((s) => s.trim()).filter(Boolean);
}

async function pickUser(page: Page, label: string) {
  await page.getByRole("combobox", { name: /^User$/ }).click();
  await page.getByRole("option", { name: new RegExp(label, "i") }).click();
}

test.describe("Rights Management — switching user type/user reloads cleanly", () => {
  test.skip(
    !process.env.PLAYWRIGHT_ADMIN_EMAIL,
    "Requires PLAYWRIGHT_ADMIN_EMAIL/PASSWORD env vars",
  );

  test("switching user type Admin → Agent → Admin restores per-user state without leaking", async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto("/rights-management");
    await expect(page.getByRole("heading", { name: /Rights Management/i })).toBeVisible();

    // Auto-selected admin: all four Forms switches are on.
    await pickUserType(page, "Admin");
    await expect(formsSwitch(page, "view")).toHaveAttribute("data-state", "checked");

    // Revoke "view" on Forms for this admin.
    await formsSwitch(page, "view").click();
    await expect(formsSwitch(page, "view")).toHaveAttribute("data-state", "unchecked");

    // Switch type to Agent — auto-selects an agent with agent-defaults.
    // Agent default: only view is checked; create/edit/delete are off.
    await pickUserType(page, "Agent");
    await expect(formsSwitch(page, "view")).toHaveAttribute("data-state", "checked");
    await expect(formsSwitch(page, "create")).toHaveAttribute("data-state", "unchecked");
    await expect(formsSwitch(page, "edit")).toHaveAttribute("data-state", "unchecked");
    await expect(formsSwitch(page, "delete")).toHaveAttribute("data-state", "unchecked");

    // Switching back to Admin restores the admin we modified.
    await pickUserType(page, "Admin");
    await expect(formsSwitch(page, "view")).toHaveAttribute("data-state", "unchecked");
    // Other admin defaults remain intact (not leaked from agent view).
    await expect(formsSwitch(page, "create")).toHaveAttribute("data-state", "checked");
    await expect(formsSwitch(page, "edit")).toHaveAttribute("data-state", "checked");
    await expect(formsSwitch(page, "delete")).toHaveAttribute("data-state", "checked");
  });

  test("switching between two users of the same type loads each user's own permissions", async ({
    page,
  }) => {
    await loginAdmin(page);
    await page.goto("/rights-management");
    await pickUserType(page, "Admin");

    const admins = await listUserOptions(page);
    test.skip(admins.length < 2, "Needs at least two active admins to verify isolation");

    const [first, second] = admins;
    await pickUser(page, first);
    // Revoke "create" on Forms for the first admin.
    await expect(formsSwitch(page, "create")).toHaveAttribute("data-state", "checked");
    await formsSwitch(page, "create").click();
    await expect(formsSwitch(page, "create")).toHaveAttribute("data-state", "unchecked");

    // Select the second admin — must show defaults (no leakage from the first).
    await pickUser(page, second);
    await expect(formsSwitch(page, "create")).toHaveAttribute("data-state", "checked");
    await expect(formsSwitch(page, "view")).toHaveAttribute("data-state", "checked");

    // Back to the first admin — change persists for them only.
    await pickUser(page, first);
    await expect(formsSwitch(page, "create")).toHaveAttribute("data-state", "unchecked");
  });
});