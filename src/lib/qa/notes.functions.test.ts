import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, createQueryBuilder } from "@/test/supabase-mock";
import { vi as _vi } from "vitest";

vi.mock("@tanstack/react-start", async () => {
  const { createServerFnFactory } = await import("@/test/server-fn-harness");
  return { createServerFn: createServerFnFactory() };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { __mock: true },
}));

import * as Notes from "./notes.functions";

type Call = (a: { data?: unknown; context?: unknown }) => Promise<unknown>;
const listNotes = Notes.listNotes as unknown as Call;
const createNote = Notes.createNote as unknown as Call;
const updateNote = Notes.updateNote as unknown as Call;
const deleteNote = Notes.deleteNote as unknown as Call;
const noteCounts = Notes.noteCounts as unknown as Call;
const { NOTE_COLORS } = Notes;

function ctx(result: unknown = { data: [], error: null }) {
  const sb = createSupabaseMock();
  const builders: Array<ReturnType<typeof createQueryBuilder>> = [];
  (sb.client as { from: unknown }).from = _vi.fn(() => {
    const b = createQueryBuilder(result as Parameters<typeof createQueryBuilder>[0]);
    builders.push(b);
    return b;
  });
  (sb as unknown as { lastBuilder: () => unknown }).lastBuilder = () =>
    builders[builders.length - 1];
  return { supabase: sb.client, userId: "user-1", sb };
}

describe("notes.functions validators", () => {
  it("listNotes coerces inputs and trims search/tag", async () => {
    const c = ctx({ data: [], error: null });
    await listNotes({ data: { archived: 1, search: "  hello  ", tag: " bug " }, context: c });
    const b = c.sb.lastBuilder();
    expect(b.calls.some((x: { method: string }) => x.method === "eq")).toBe(true);
    expect(b.calls.find((x: { method: string }) => x.method === "or")?.args[0]).toContain("hello");
    expect(b.calls.find((x: { method: string }) => x.method === "contains")?.args[1]).toEqual([
      "bug",
    ]);
  });

  it("listNotes escapes % and _ in search to prevent ilike wildcards", async () => {
    const c = ctx({ data: [], error: null });
    await listNotes({ data: { search: "50%_off" }, context: c });
    const b = c.sb.lastBuilder();
    const or = b.calls.find((x: { method: string }) => x.method === "or");
    expect(or?.args[0]).toContain("50\\%\\_off");
  });

  it("listNotes maps rows and applies default colour fallback", async () => {
    const c = ctx({
      data: [
        {
          id: 1,
          color: "neon",
          tags: null,
          is_pinned: 1,
          is_archived: 0,
          created_at: "a",
          updated_at: "b",
        },
      ],
      error: null,
    });
    const out = (await listNotes({ data: {}, context: c })) as Array<Record<string, unknown>>;
    expect(out[0]).toMatchObject({ id: "1", color: "yellow", tags: [], is_pinned: true });
  });

  it("listNotes surfaces DB errors", async () => {
    const c = ctx({ data: null, error: { message: "boom" } });
    await expect(listNotes({ data: {}, context: c })).rejects.toThrow("boom");
  });

  it("createNote clamps title and rejects unknown color", async () => {
    const long = "x".repeat(300);
    const c = ctx({
      data: {
        id: "n1",
        title: long.slice(0, 200),
        color: "yellow",
        created_at: "",
        updated_at: "",
      },
      error: null,
    });
    const out = (await createNote({ data: { title: long, color: "rainbow" }, context: c })) as {
      color: string;
      title: string;
    };
    expect(out.color).toBe("yellow");
    expect(out.title.length).toBe(200);
    const insert = c.sb.lastBuilder().calls.find((x: { method: string }) => x.method === "insert");
    expect((insert?.args[0] as { title: string }).title.length).toBe(200);
  });

  it("updateNote requires id and whitelists patch fields", async () => {
    const c = ctx({
      data: { id: "n1", color: "blue", created_at: "", updated_at: "" },
      error: null,
    });
    await expect(updateNote({ data: { patch: {} }, context: c })).rejects.toThrow("id required");
    await updateNote({
      data: {
        id: "n1",
        patch: {
          title: "t",
          color: "blue",
          tags: ["  one ", "", 2, "two"],
          is_pinned: true,
          unknown: "ignored",
        },
      },
      context: c,
    });
    const update = c.sb.lastBuilder().calls.find((x: { method: string }) => x.method === "update");
    const patch = update?.args[0] as Record<string, unknown>;
    expect(patch.title).toBe("t");
    expect(patch.color).toBe("blue");
    expect(patch.tags).toEqual(["one", "two"]);
    expect(patch.is_pinned).toBe(true);
    expect(patch.unknown).toBeUndefined();
    expect(patch.updated_by).toBe("user-1");
  });

  it("deleteNote requires id and scopes by user", async () => {
    const c = ctx({ data: null, error: null });
    await expect(deleteNote({ data: {}, context: c })).rejects.toThrow("id required");
    await deleteNote({ data: { id: "n1" }, context: c });
    const eqs = c.sb.lastBuilder().calls.filter((x: { method: string }) => x.method === "eq");
    expect(eqs.map((e: { args: unknown[] }) => e.args[0])).toEqual(["id", "user_id"]);
  });

  it("noteCounts aggregates archived vs active", async () => {
    const c = ctx({
      data: [{ is_archived: true }, { is_archived: false }, { is_archived: false }],
      error: null,
    });
    const out = (await noteCounts({ context: c })) as {
      total: number;
      active: number;
      archived: number;
    };
    expect(out).toEqual({ total: 3, active: 2, archived: 1 });
  });

  it("NOTE_COLORS palette is stable", () => {
    expect(NOTE_COLORS).toEqual(["yellow", "blue", "green", "red", "purple", "grey"]);
  });
});
