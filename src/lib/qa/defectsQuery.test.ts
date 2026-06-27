import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock, createQueryBuilder } from "@/test/supabase-mock";

const supa = createSupabaseMock();
vi.mock("@/integrations/supabase/client", () => ({ supabase: supa.client }));

const { queryDefectsPage, queryDefectsAll } = await import("./defectsQuery");
type DefectQuerySpec = import("./defectsQuery").DefectQuerySpec;

function lastCalls() {
  return supa.lastBuilder().calls as Array<{ method: string; args: unknown[] }>;
}
function callsOfBuilder(i: number) {
  return supa.builders[i].calls as Array<{ method: string; args: unknown[] }>;
}

describe("queryDefectsPage", () => {
  beforeEach(() => {
    supa.builders.length = 0;
    supa.from.mockClear();
  });

  it("selects from defects with exact count and applies env + range + ordering", async () => {
    const row = {
      id: "ZEN-1",
      module: "1099 Forms",
      form_feature: "NEC",
      title: "t",
      status: "Reported",
      validity: "Valid",
      priority: "High",
      severity: "High",
      assigned_agent: "Alice",
      created_by: "Alice",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    };
    supa.from.mockImplementationOnce(() => {
      const b = createQueryBuilder({ data: [row], count: 1, error: null });
      supa.builders.push(b);
      return b;
    });
    const out = await queryDefectsPage(
      { environment: "Production" },
      { key: "createdAt", dir: "desc" },
      2,
      25,
    );

    expect(supa.from).toHaveBeenCalledWith("defects");
    const calls = lastCalls();
    expect(calls.find((c) => c.method === "select")?.args[1]).toEqual({ count: "exact" });
    expect(calls.find((c) => c.method === "eq" && c.args[0] === "environment")?.args[1]).toBe(
      "Production",
    );
    // Range for page=2 size=25 → 25..49
    const range = calls.find((c) => c.method === "range");
    expect(range?.args).toEqual([25, 49]);
    // Primary order then id tiebreaker
    const orders = calls.filter((c) => c.method === "order");
    expect(orders[0].args).toEqual(["created_at", { ascending: false }]);
    expect(orders[1].args).toEqual(["id", { ascending: true }]);
    expect(out.total).toBe(1);
    expect(out.rows[0]).toMatchObject({ id: "ZEN-1", formFeature: "NEC", validityLabel: "Valid" });
  });

  it("maps Unverified / null validity to 'Pending Review'", async () => {
    supa.from.mockImplementationOnce(() => {
      const b = createQueryBuilder({
        data: [
          { id: "1", validity: null },
          { id: "2", validity: "Unverified" },
          { id: "3", validity: "Valid" },
        ],
        count: 3,
        error: null,
      });
      supa.builders.push(b);
      return b;
    });
    const out = await queryDefectsPage({}, { key: "id", dir: "asc" }, 1, 10);
    expect(out.rows.map((r) => r.validityLabel)).toEqual([
      "Pending Review",
      "Pending Review",
      "Valid",
    ]);
  });

  it("does not add a redundant id tiebreaker when sorting by id", async () => {
    await queryDefectsPage({}, { key: "id", dir: "asc" }, 1, 10);
    const orders = lastCalls().filter((c) => c.method === "order");
    expect(orders).toHaveLength(1);
    expect(orders[0].args).toEqual(["id", { ascending: true }]);
  });

  it("applies validity, statusGroup, tax year, module, agent and date filters", async () => {
    const spec: DefectQuerySpec = {
      taxYear: "2025",
      module: "Integrations",
      validity: "Pending Review",
      statusGroup: "Open",
      agent: "Bob",
      from: "2026-01-01",
      to: "2026-02-01",
    };
    await queryDefectsPage(spec, { key: "updatedAt", dir: "asc" }, 1, 50);
    const calls = lastCalls();
    const has = (m: string, ...args: unknown[]) =>
      calls.some(
        (c) =>
          c.method === m && args.every((a, i) => JSON.stringify(c.args[i]) === JSON.stringify(a)),
      );
    expect(has("eq", "tax_year", "2025")).toBe(true);
    expect(has("eq", "module", "Integrations")).toBe(true);
    expect(has("gte", "created_at", "2026-01-01")).toBe(true);
    expect(has("lt", "created_at", "2026-02-01")).toBe(true);
    // Pending Review validity OR clause appears
    expect(
      calls.some((c) => c.method === "or" && /validity\.is\.null/.test(String(c.args[0]))),
    ).toBe(true);
    // Open status: exclude Fixed/Closed
    expect(calls.some((c) => c.method === "not" && c.args[0] === "status")).toBe(true);
    // Agent OR clause
    expect(calls.some((c) => c.method === "or" && String(c.args[0]).includes("Bob"))).toBe(true);
  });

  it("'all' sentinels disable taxYear, category, testingType and agent filters", async () => {
    await queryDefectsPage(
      { taxYear: "all", category: "all", testingType: "all", agent: "all" },
      { key: "id", dir: "asc" },
      1,
      10,
    );
    const calls = lastCalls();
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "tax_year")).toBe(false);
    expect(calls.some((c) => c.method === "ilike" && c.args[0] === "module")).toBe(false);
    expect(calls.some((c) => c.method === "or")).toBe(false);
  });

  it("statusGroup variants apply expected filters", async () => {
    type Call = { method: string; args: unknown[] };
    type CheckFn = (calls: Call[]) => boolean;
    const cases: Array<[string, CheckFn]> = [
      ["Fixed", (calls) => calls.some((c) => c.method === "in" && c.args[0] === "status")],
      [
        "Retest Required",
        (calls) => calls.some((c) => c.method === "eq" && c.args[1] === "Retest Required"),
      ],
      [
        "Valid",
        (calls) =>
          calls.some((c) => c.method === "eq" && c.args[0] === "validity" && c.args[1] === "Valid"),
      ],
      [
        "Invalid",
        (calls) =>
          calls.some(
            (c) => c.method === "eq" && c.args[0] === "validity" && c.args[1] === "Invalid",
          ),
      ],
      [
        "Pending Review",
        (calls) =>
          calls.some((c) => c.method === "or" && String(c.args[0]).includes("Unverified")),
      ],
      [
        "all",
        (calls) =>
          !calls.some((c) => c.method === "in" || (c.method === "eq" && c.args[0] === "validity")),
      ],
    ];
    for (const [grp, check] of cases) {
      supa.builders.length = 0;
      await queryDefectsPage(
        { statusGroup: grp as Parameters<typeof queryDefectsPage>[0]["statusGroup"] },
        { key: "id", dir: "asc" },
        1,
        10,
      );
      expect(check(lastCalls())).toBe(true);
    }
  });

  it("validity='Valid' and 'Invalid' add direct eq filters", async () => {
    supa.builders.length = 0;
    await queryDefectsPage({ validity: "Valid" }, { key: "id", dir: "asc" }, 1, 10);
    expect(
      lastCalls().some(
        (c) => c.method === "eq" && c.args[0] === "validity" && c.args[1] === "Valid",
      ),
    ).toBe(true);
    supa.builders.length = 0;
    await queryDefectsPage({ validity: "Invalid" }, { key: "id", dir: "asc" }, 1, 10);
    expect(
      lastCalls().some(
        (c) => c.method === "eq" && c.args[0] === "validity" && c.args[1] === "Invalid",
      ),
    ).toBe(true);
  });

  it("unknown sort key falls back to created_at", async () => {
    await queryDefectsPage({}, { key: "bogus", dir: "asc" }, 1, 10);
    expect(lastCalls().find((c) => c.method === "order")?.args[0]).toBe("created_at");
  });

  it("propagates error from Supabase", async () => {
    supa.from.mockImplementationOnce(() => {
      const b = createQueryBuilder({ data: null, count: null, error: { message: "boom" } });
      supa.builders.push(b);
      return b;
    });
    await expect(queryDefectsPage({}, { key: "id", dir: "asc" }, 1, 10)).rejects.toMatchObject({
      message: "boom",
    });
  });

  it("page=1 with size 10 produces range 0..9", async () => {
    await queryDefectsPage({}, { key: "id", dir: "asc" }, 1, 10);
    expect(lastCalls().find((c) => c.method === "range")?.args).toEqual([0, 9]);
  });

  it("negative page numbers clamp to 0..size-1", async () => {
    await queryDefectsPage({}, { key: "id", dir: "asc" }, -3, 10);
    expect(lastCalls().find((c) => c.method === "range")?.args).toEqual([0, 9]);
  });
});

describe("queryDefectsAll", () => {
  beforeEach(() => {
    supa.builders.length = 0;
    supa.from.mockClear();
  });

  it("stops after first short page", async () => {
    supa.from.mockImplementationOnce(() => {
      const b = createQueryBuilder({ data: [{ id: "a" }, { id: "b" }], count: 2, error: null });
      supa.builders.push(b);
      return b;
    });
    const rows = await queryDefectsAll({}, { key: "id", dir: "asc" });
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(supa.from).toHaveBeenCalledTimes(1);
  });

  it("respects the cap and stops paging once cap is reached", async () => {
    const fullChunk = Array.from({ length: 1000 }, (_, i) => ({ id: `r${i}` }));
    supa.from
      .mockImplementationOnce(() => {
        const b = createQueryBuilder({ data: fullChunk, count: 5000, error: null });
        supa.builders.push(b);
        return b;
      })
      .mockImplementationOnce(() => {
        const b = createQueryBuilder({ data: fullChunk, count: 5000, error: null });
        supa.builders.push(b);
        return b;
      });
    const rows = await queryDefectsAll({}, { key: "id", dir: "asc" }, 1500);
    expect(rows).toHaveLength(1500);
    // page 1 then page 2 each pull 1000 rows; loop exits when out.length >= cap
    expect(supa.from.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Verify the second call used range 1000..1999
    expect(callsOfBuilder(1).find((c) => c.method === "range")?.args).toEqual([1000, 1999]);
  });
});
