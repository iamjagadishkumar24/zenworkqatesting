import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError, info: vi.fn() },
}));

// Trim MODULE_OPTIONS so we can exercise search + pagination predictably.
vi.mock("@/lib/qa/constants", () => ({
  MODULE_OPTIONS: [
    "Forms",
    "1099 Online Forms",
    "Integrations",
    "Chatbot Testing",
    "Excel Import Testing",
    "Functionality Testing",
    "Tax1099 Features",
    "Zenwork Payments",
    "990 Form Testing",
    "2290 Forms",
  ],
}));

const { mockUsers } = vi.hoisted(() => ({
  mockUsers: [
    { id: "a1", name: "Alice Admin", email: "alice@test", role: "admin", active: true },
    { id: "a2", name: "Andy Admin", email: "andy@test", role: "admin", active: true },
    { id: "g1", name: "Greta Agent", email: "greta@test", role: "agent", active: true },
    { id: "g2", name: "Gus Agent", email: "gus@test", role: "agent", active: true },
    { id: "x1", name: "Inactive Agent", email: "x@test", role: "agent", active: false },
  ],
}));

vi.mock("@/lib/qa/store", () => ({
  useQA: () => ({ users: mockUsers }),
}));

vi.mock("@/lib/qa/permissions.functions", () => ({
  listUserPermissionOverrides: vi.fn().mockResolvedValue([]),
  setUserPermission: vi.fn().mockResolvedValue({ ok: true }),
  listMyPermissionOverrides: vi.fn().mockResolvedValue([]),
}));

import { RightsManagementPage } from "./_app._admin.rights-management";
import {
  __resetPermissionAuditForTests,
  getPermissionAudit,
} from "@/lib/qa/permissionAudit";

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
  window.localStorage.clear();
  __resetPermissionAuditForTests();
  if (!("randomUUID" in crypto)) {
    Object.defineProperty(crypto, "randomUUID", {
      value: () => Math.random().toString(36).slice(2),
      configurable: true,
    });
  }
});

function rowFor(module: string) {
  const cell = screen.getByRole("cell", { name: module });
  // eslint-disable-next-line testing-library/no-node-access
  return cell.closest("tr") as HTMLTableRowElement;
}

describe("RightsManagementPage", () => {
  it("renders permission matrix with default admin grants for the first admin", () => {
    render(<RightsManagementPage />);
    expect(
      screen.getByRole("heading", { name: /Rights Management/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Alice Admin \(admin\)/)).toBeInTheDocument();
    const row = rowFor("Forms");
    const switches = within(row).getAllByRole("switch");
    switches.forEach((s) => expect(s).toHaveAttribute("data-state", "checked"));
    // Inline audit history table has been moved to Settings.
    expect(screen.queryByRole("heading", { name: /audit history/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/No permission changes yet/i)).not.toBeInTheDocument();
  });

  it("toggling 'view' off records an audit entry and toasts success", async () => {
    render(<RightsManagementPage />);
    const viewSwitch = within(rowFor("Forms")).getAllByRole("switch")[0];
    fireEvent.click(viewSwitch);
    expect(viewSwitch).toHaveAttribute("data-state", "unchecked");
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringMatching(/Revoked view on "Forms" for Alice Admin/),
      ),
    );
    const audit = getPermissionAudit();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      userId: "a1",
      userName: "Alice Admin",
      role: "admin",
      module: "Forms",
      action: "view",
      enabled: false,
    });
  });

  it("asks for confirmation before revoking delete and applies on confirm", async () => {
    render(<RightsManagementPage />);
    const deleteSwitch = within(rowFor("Forms")).getAllByRole("switch")[3];
    fireEvent.click(deleteSwitch);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Revoke permission/i)).toBeInTheDocument();
    expect(deleteSwitch).toHaveAttribute("data-state", "checked");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Revoke$/ }));
    await waitFor(() =>
      expect(deleteSwitch).toHaveAttribute("data-state", "unchecked"),
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/Revoked delete on "Forms" for Alice Admin/),
    );
  });

  it("cancel on the destructive dialog keeps the permission intact", async () => {
    render(<RightsManagementPage />);
    const editSwitch = within(rowFor("Forms")).getAllByRole("switch")[2];
    fireEvent.click(editSwitch);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Cancel/i }));
    expect(editSwitch).toHaveAttribute("data-state", "checked");
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("filters modules by search and resets pagination", () => {
    render(<RightsManagementPage />);
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search modules/i), {
      target: { value: "1099" },
    });
    expect(screen.queryByRole("cell", { name: "Integrations" })).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1099 Online Forms" })).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
  });

  it("paginates with Previous/Next controls", () => {
    render(<RightsManagementPage />);
    expect(screen.queryByRole("cell", { name: "990 Form Testing" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(screen.getByRole("cell", { name: "990 Form Testing" })).toBeInTheDocument();
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
  });

  it("shows empty state when search matches nothing", () => {
    render(<RightsManagementPage />);
    fireEvent.change(screen.getByPlaceholderText(/Search modules/i), {
      target: { value: "zzz-nope" },
    });
    expect(screen.getByText(/No modules match "zzz-nope"/i)).toBeInTheDocument();
  });

  it("switches user type to Agent and auto-selects the first active agent with agent defaults", async () => {
    render(<RightsManagementPage />);
    fireEvent.click(screen.getByRole("combobox", { name: /User type/i }));
    fireEvent.click(screen.getByRole("option", { name: /agent/i }));
    await waitFor(() =>
      expect(screen.getByText(/Greta Agent \(agent\)/)).toBeInTheDocument(),
    );
    const row = rowFor("Forms");
    const switches = within(row).getAllByRole("switch");
    expect(switches[0]).toHaveAttribute("data-state", "checked"); // view
    expect(switches[1]).toHaveAttribute("data-state", "unchecked"); // create
    expect(switches[2]).toHaveAttribute("data-state", "unchecked"); // edit
    expect(switches[3]).toHaveAttribute("data-state", "unchecked"); // delete
  });

  it("keeps permission state isolated per user when switching between users", async () => {
    render(<RightsManagementPage />);
    // Revoke view on Forms for Alice (default-selected admin).
    fireEvent.click(within(rowFor("Forms")).getAllByRole("switch")[0]);
    // Switch to Andy via the User dropdown.
    fireEvent.click(screen.getByRole("combobox", { name: /^User$/ }));
    fireEvent.click(screen.getByRole("option", { name: /Andy Admin/ }));
    await waitFor(() =>
      expect(screen.getByText(/Andy Admin \(admin\)/)).toBeInTheDocument(),
    );
    // Andy keeps the default admin grants — Alice's change didn't leak.
    const andyView = within(rowFor("Forms")).getAllByRole("switch")[0];
    expect(andyView).toHaveAttribute("data-state", "checked");
  });

  it("excludes inactive agents from the User dropdown", () => {
    render(<RightsManagementPage />);
    fireEvent.click(screen.getByRole("combobox", { name: /User type/i }));
    fireEvent.click(screen.getByRole("option", { name: /agent/i }));
    fireEvent.click(screen.getByRole("combobox", { name: /^User$/ }));
    expect(screen.getByRole("option", { name: /Greta Agent/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Gus Agent/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Inactive Agent/ })).not.toBeInTheDocument();
  });

  it("exports the selected user's permissions as JSON and toasts success", () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL =
      createObjectURL;
    (URL as unknown as { revokeObjectURL: typeof revokeObjectURL }).revokeObjectURL =
      revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(<RightsManagementPage />);
    fireEvent.click(screen.getByRole("button", { name: /Export/i }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("Permissions exported");
    clickSpy.mockRestore();
  });

  it("imports a valid per-user permissions JSON file and toasts success", async () => {
    render(<RightsManagementPage />);
    const valid = JSON.stringify({
      userId: "a1",
      role: "admin",
      permissions: { Forms: { view: false, create: false, edit: false, delete: false } },
    });
    const file = new File([valid], "perms.json", { type: "application/json" });
    // eslint-disable-next-line testing-library/no-node-access
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Permissions imported"),
    );
  });

  it("rejects an invalid permissions JSON file with an error toast", async () => {
    render(<RightsManagementPage />);
    const file = new File(["{not json"], "bad.json", { type: "application/json" });
    // eslint-disable-next-line testing-library/no-node-access
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Invalid permissions file"));
  });

  it("rejects a JSON file missing the required permissions key", async () => {
    render(<RightsManagementPage />);
    const file = new File([JSON.stringify({ userId: "a1" })], "partial.json", {
      type: "application/json",
    });
    // eslint-disable-next-line testing-library/no-node-access
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Invalid permissions file"));
  });
});