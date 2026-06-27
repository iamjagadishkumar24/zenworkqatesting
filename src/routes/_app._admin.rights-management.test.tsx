import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

const toastSuccess = vi.fn();
const toastError = vi.fn();
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

import { RightsManagementPage } from "./_app._admin.rights-management";

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
  // crypto.randomUUID polyfill for jsdom
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
  it("renders permission matrix with default admin grants and audit empty state", () => {
    render(<RightsManagementPage />);
    expect(
      screen.getByRole("heading", { name: /Rights Management/i }),
    ).toBeInTheDocument();
    const row = rowFor("Forms");
    const switches = within(row).getAllByRole("switch");
    // admin role defaults: view/create/edit/delete all true
    switches.forEach((s) => expect(s).toHaveAttribute("data-state", "checked"));
    expect(screen.getByText(/No permission changes yet/i)).toBeInTheDocument();
  });

  it("grants/revokes non-destructive permissions and logs an audit entry + toast", () => {
    render(<RightsManagementPage />);
    const viewSwitch = within(rowFor("Forms")).getAllByRole("switch")[0];
    // toggling 'view' off is non-destructive and applies directly
    fireEvent.click(viewSwitch);
    expect(viewSwitch).toHaveAttribute("data-state", "unchecked");
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/Revoked view on "Forms" for admin/),
    );
    expect(screen.getByRole("cell", { name: /Revoked/i })).toBeInTheDocument();
  });

  it("asks for confirmation before revoking delete and applies on confirm", async () => {
    render(<RightsManagementPage />);
    const deleteSwitch = within(rowFor("Forms")).getAllByRole("switch")[3];
    fireEvent.click(deleteSwitch);
    // dialog appears
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Revoke permission/i)).toBeInTheDocument();
    // switch still on until confirmed
    expect(deleteSwitch).toHaveAttribute("data-state", "checked");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Revoke$/ }));
    await waitFor(() =>
      expect(deleteSwitch).toHaveAttribute("data-state", "unchecked"),
    );
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.stringMatching(/Revoked delete on "Forms" for admin/),
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

  it("switches role and shows agent-defaults (view only)", () => {
    render(<RightsManagementPage />);
    // open select and choose agent
    fireEvent.click(screen.getByRole("combobox", { name: /Role/i }));
    fireEvent.click(screen.getByRole("option", { name: /agent/i }));
    const row = rowFor("Forms");
    const switches = within(row).getAllByRole("switch");
    expect(switches[0]).toHaveAttribute("data-state", "checked"); // view
    expect(switches[1]).toHaveAttribute("data-state", "unchecked"); // create
    expect(switches[2]).toHaveAttribute("data-state", "unchecked"); // edit
    expect(switches[3]).toHaveAttribute("data-state", "unchecked"); // delete
  });

  it("exports the permissions matrix as JSON and toasts success", () => {
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

  it("imports a valid permissions JSON file and toasts success", async () => {
    render(<RightsManagementPage />);
    const valid = JSON.stringify({
      admin: { Forms: { view: false, create: false, edit: false, delete: false } },
      agent: { Forms: { view: true, create: false, edit: false, delete: false } },
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

  it("rejects a JSON file missing required role keys", async () => {
    render(<RightsManagementPage />);
    const file = new File([JSON.stringify({ admin: {} })], "partial.json", {
      type: "application/json",
    });
    // eslint-disable-next-line testing-library/no-node-access
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Invalid permissions file"));
  });
});
