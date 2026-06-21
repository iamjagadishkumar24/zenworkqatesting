import { describe, it, expect } from "vitest";
import { filterByEnvironment, filterReportedBy, scopeForUser } from "./scope";

type D = { id: string; createdBy: string; assignedAgent?: string; environment?: string | null };

const defects: D[] = [
  { id: "1", createdBy: "Alice", assignedAgent: "Alice", environment: "Production" },
  { id: "2", createdBy: "Bob", assignedAgent: "Alice", environment: "Stage" },
  { id: "3", createdBy: "Alice", assignedAgent: "Bob", environment: "Production" },
  { id: "4", createdBy: "Carol", assignedAgent: "Bob", environment: null },
];

describe("environment + reporter scoping", () => {
  it("filterByEnvironment returns only items in the selected env (and env-less)", () => {
    expect(filterByEnvironment(defects, "Production").map((d) => d.id)).toEqual(["1", "3", "4"]);
    expect(filterByEnvironment(defects, "Stage").map((d) => d.id)).toEqual(["2", "4"]);
  });

  it("filterByEnvironment is a no-op when env is null/undefined", () => {
    expect(filterByEnvironment(defects, null)).toHaveLength(4);
    expect(filterByEnvironment(defects, undefined)).toHaveLength(4);
  });

  it("filterReportedBy returns only items created by the given user", () => {
    expect(filterReportedBy(defects, "Alice").map((d) => d.id)).toEqual(["1", "3"]);
    expect(filterReportedBy(defects, "Bob").map((d) => d.id)).toEqual(["2"]);
  });

  it("scopeForUser: agent sees only their reported errors, never assignments by others", () => {
    const agentAlice = scopeForUser(defects, { name: "Alice", role: "agent" });
    expect(agentAlice.map((d) => d.id)).toEqual(["1", "3"]);
    // Defect 2 is assigned to Alice but reported by Bob — must be excluded.
    expect(agentAlice.find((d) => d.id === "2")).toBeUndefined();
  });

  it("scopeForUser: admin sees every reported error", () => {
    const admin = scopeForUser(defects, { name: "Admin", role: "admin" });
    expect(admin).toHaveLength(4);
  });

  it("scopeForUser returns [] when no user is signed in", () => {
    expect(scopeForUser(defects, null)).toEqual([]);
  });

  it("combined env + user scope behaves consistently across views", () => {
    // Simulates what dashboard/forms/defects/notifications should show.
    const agentInProd = filterByEnvironment(
      scopeForUser(defects, { name: "Alice", role: "agent" }),
      "Production",
    );
    expect(agentInProd.map((d) => d.id)).toEqual(["1", "3"]);

    const agentInStage = filterByEnvironment(
      scopeForUser(defects, { name: "Alice", role: "agent" }),
      "Stage",
    );
    expect(agentInStage).toEqual([]);

    const adminInStage = filterByEnvironment(
      scopeForUser(defects, { name: "Admin", role: "admin" }),
      "Stage",
    );
    expect(adminInStage.map((d) => d.id)).toEqual(["2", "4"]);
  });
});
