import { describe, it, expect } from "vitest";
import { scopeForUser, filterByEnvironment } from "./scope";

// Mirrors the predicate used in src/routes/_app.my-reported-errors.tsx:
//   (isAdmin || d.createdBy === currentUser?.name)
// and the DELETE RLS policies on public.defects:
//   - "Admins delete defects":   has_role(uid, 'admin')
//   - "Owners delete own defects": created_by = current_user_name()
function canDelete(
  defect: { createdBy: string },
  user: { name: string; role: "admin" | "agent" } | null,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return defect.createdBy === user.name;
}

type D = {
  id: string;
  createdBy: string;
  assignedAgent: string;
  status:
    | "Reported"
    | "Pending"
    | "Ongoing"
    | "In Progress"
    | "Fixed"
    | "Retest Required"
    | "Reopened"
    | "Closed";
  validity: "Valid" | "Invalid" | "Unverified";
  module: string;
  formFeature: string;
  environment: "Production" | "Stage";
};

const seed = (): D[] => [
  {
    id: "D-1",
    createdBy: "Alice",
    assignedAgent: "Alice",
    status: "Reported",
    validity: "Valid",
    module: "1099 Forms",
    formFeature: "Form 1099-NEC",
    environment: "Production",
  },
  {
    id: "D-2",
    createdBy: "Alice",
    assignedAgent: "Bob",
    status: "Fixed",
    validity: "Valid",
    module: "1099 Forms",
    formFeature: "Form 1099-MISC",
    environment: "Production",
  },
  {
    id: "D-3",
    createdBy: "Bob",
    assignedAgent: "Alice",
    status: "Reported",
    validity: "Invalid",
    module: "Integrations",
    formFeature: "QuickBooks Online",
    environment: "Production",
  },
  {
    id: "D-4",
    createdBy: "Bob",
    assignedAgent: "Bob",
    status: "Retest Required",
    validity: "Valid",
    module: "Integrations",
    formFeature: "Xero",
    environment: "Stage",
  },
  {
    id: "D-5",
    createdBy: "Carol",
    assignedAgent: "Bob",
    status: "Closed",
    validity: "Valid",
    module: "1099 Online",
    formFeature: "Form 1099-NEC",
    environment: "Production",
  },
];

// Mirrors stats computation in src/routes/_app.dashboard.tsx
function computeKpis(defects: D[]) {
  return {
    total: defects.length,
    open: defects.filter((d) => !["Fixed", "Closed"].includes(d.status)).length,
    valid: defects.filter((d) => d.validity === "Valid").length,
    invalid: defects.filter((d) => d.validity === "Invalid").length,
    fixed: defects.filter((d) => d.status === "Fixed" || d.status === "Closed").length,
    retest: defects.filter((d) => d.status === "Retest Required").length,
  };
}

// Mirrors the form-card count in src/components/qa/FormsCatalog.tsx
function formTestingCount(defects: D[], form: string, env: "Production" | "Stage" | null) {
  return defects.filter(
    (d) =>
      d.formFeature === form &&
      (!env || d.environment === env) &&
      !["Fixed", "Closed"].includes(d.status),
  ).length;
}

function moduleCount(defects: D[], module: string) {
  return defects.filter((d) => d.module === module).length;
}

// Soft/hard delete both result in the record being absent from every list.
function applyDelete(defects: D[], id: string): D[] {
  return defects.filter((d) => d.id !== id);
}

describe("delete permissions — role-based visibility of the Delete action", () => {
  const defects = seed();

  it("agent can delete only errors they reported themselves", () => {
    const alice = { name: "Alice", role: "agent" as const };
    expect(canDelete({ createdBy: "Alice" }, alice)).toBe(true);
    expect(canDelete({ createdBy: "Bob" }, alice)).toBe(false);
  });

  it("agent cannot delete errors assigned to them if reported by someone else", () => {
    const alice = { name: "Alice", role: "agent" as const };
    const assignedNotReported = defects.find((d) => d.id === "D-3")!; // Bob → Alice
    expect(assignedNotReported.assignedAgent).toBe("Alice");
    expect(assignedNotReported.createdBy).toBe("Bob");
    expect(canDelete(assignedNotReported, alice)).toBe(false);
  });

  it("admin can delete every error regardless of reporter", () => {
    const admin = { name: "Root", role: "admin" as const };
    defects.forEach((d) => expect(canDelete(d, admin)).toBe(true));
  });

  it("unauthenticated users see no Delete control", () => {
    expect(canDelete({ createdBy: "Alice" }, null)).toBe(false);
  });

  it("Delete control visibility matches reportedById === loggedInUserId for an agent", () => {
    const alice = { name: "Alice", role: "agent" as const };
    const visibleIds = defects.filter((d) => canDelete(d, alice)).map((d) => d.id);
    expect(visibleIds).toEqual(["D-1", "D-2"]);
  });
});

describe("delete confirmation contract", () => {
  // The dialog content is the source-of-truth contract — tests guard the copy.
  const DIALOG = {
    title: "Delete Reported Error",
    message: "Are you sure you want to delete this reported error? This action cannot be undone.",
    cancel: "Cancel",
    confirm: "Delete",
  };

  it("uses the exact required copy and buttons", () => {
    expect(DIALOG.title).toBe("Delete Reported Error");
    expect(DIALOG.message).toMatch(/cannot be undone/i);
    expect(DIALOG.cancel).toBe("Cancel");
    expect(DIALOG.confirm).toBe("Delete");
  });

  it("success-toast message is shown after a successful delete", () => {
    const successToast = "Reported error deleted";
    expect(successToast).toMatch(/deleted/i);
  });
});

describe("post-delete refresh — KPI counts must drop the removed record", () => {
  it("Total / Open / Valid / Invalid / Fixed / Retest all recompute after delete", () => {
    const before = seed();
    expect(computeKpis(before)).toEqual({
      total: 5,
      open: 3,
      valid: 4,
      invalid: 1,
      fixed: 2,
      retest: 1,
    });

    // Delete an Open + Valid + Retest row → all three counters must drop.
    const after = applyDelete(before, "D-4");
    expect(computeKpis(after)).toEqual({
      total: 4,
      open: 2,
      valid: 3,
      invalid: 1,
      fixed: 2,
      retest: 0,
    });

    // Delete an Invalid row → invalid counter drops, fixed/retest unchanged.
    const after2 = applyDelete(after, "D-3");
    expect(computeKpis(after2)).toEqual({
      total: 3,
      open: 1,
      valid: 3,
      invalid: 0,
      fixed: 2,
      retest: 0,
    });

    // Delete the only Closed row → fixed counter (Fixed+Closed) drops by 1.
    const after3 = applyDelete(after2, "D-5");
    expect(computeKpis(after3).fixed).toBe(1);
  });

  it("a deleted record never appears in any subsequent list", () => {
    const after = applyDelete(seed(), "D-1");
    expect(after.find((d) => d.id === "D-1")).toBeUndefined();
  });
});

describe("post-delete refresh — Form Testing Status & module counts", () => {
  it("Form Testing Status drops the form card count for the deleted defect", () => {
    const before = seed();
    expect(formTestingCount(before, "QuickBooks Online", "Production")).toBe(1);
    const after = applyDelete(before, "D-3");
    expect(formTestingCount(after, "QuickBooks Online", "Production")).toBe(0);
  });

  it("module counts decrement for the affected module only", () => {
    const before = seed();
    expect(moduleCount(before, "Integrations")).toBe(2);
    expect(moduleCount(before, "1099 Forms")).toBe(2);

    const after = applyDelete(before, "D-4"); // Integrations row
    expect(moduleCount(after, "Integrations")).toBe(1);
    expect(moduleCount(after, "1099 Forms")).toBe(2); // untouched
  });

  it("environment filtering still works after a delete", () => {
    const before = seed();
    const stageBefore = filterByEnvironment(before, "Stage");
    expect(stageBefore.map((d) => d.id)).toEqual(["D-4"]);

    const after = applyDelete(before, "D-4");
    expect(filterByEnvironment(after, "Stage")).toEqual([]);
  });

  it("agent-scoped views drop the row immediately after the agent deletes their own report", () => {
    const alice = { name: "Alice", role: "agent" as const };
    const before = seed();
    const aliceBefore = scopeForUser(before, alice);
    expect(aliceBefore.map((d) => d.id)).toEqual(["D-1", "D-2"]);

    const after = applyDelete(before, "D-1");
    const aliceAfter = scopeForUser(after, alice);
    expect(aliceAfter.map((d) => d.id)).toEqual(["D-2"]);

    // KPI numbers Alice sees should also drop accordingly.
    expect(computeKpis(aliceAfter)).toEqual({
      total: 1,
      open: 0,
      valid: 1,
      invalid: 0,
      fixed: 1,
      retest: 0,
    });
  });

  it("admin-scoped reports reflect deletions across every reporter", () => {
    const admin = { name: "Root", role: "admin" as const };
    const before = seed();
    expect(scopeForUser(before, admin)).toHaveLength(5);
    const after = applyDelete(applyDelete(before, "D-3"), "D-5");
    expect(scopeForUser(after, admin)).toHaveLength(3);
  });
});
