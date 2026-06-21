import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type NoteColor = "yellow" | "blue" | "green" | "red" | "purple" | "grey";
export const NOTE_COLORS: NoteColor[] = ["yellow", "blue", "green", "red", "purple", "grey"];

export type NoteJSON = string | number | boolean | null | { [k: string]: NoteJSON } | NoteJSON[];

export type NoteDTO = {
  id: string;
  title: string;
  content: NoteJSON;
  content_text: string;
  color: NoteColor;
  tags: string[];
  is_pinned: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

function row(r: Record<string, unknown>): NoteDTO {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    content: (r.content as NoteJSON | undefined) ?? {},
    content_text: String(r.content_text ?? ""),
    color: (NOTE_COLORS.includes(r.color as NoteColor) ? r.color : "yellow") as NoteColor,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    is_pinned: !!r.is_pinned,
    is_favorite: !!r.is_favorite,
    is_archived: !!r.is_archived,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  };
}

export const listNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as Record<string, unknown>;
    return {
      archived: !!o.archived,
      search: typeof o.search === "string" ? o.search.trim().slice(0, 200) : "",
      tag: typeof o.tag === "string" ? o.tag.trim().slice(0, 80) : "",
    };
  })
  .handler(async ({ data, context }): Promise<NoteDTO[]> => {
    let q = context.supabase
      .from("notes")
      .select("*")
      .eq("user_id", context.userId)
      .eq("is_archived", data.archived)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(500);
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      q = q.or(`title.ilike.%${s}%,content_text.ilike.%${s}%`);
    }
    if (data.tag) q = q.contains("tags", [data.tag]);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => row(r as Record<string, unknown>));
  });

export const createNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as Record<string, unknown>;
    return {
      color: (NOTE_COLORS.includes(o.color as NoteColor) ? o.color : "yellow") as NoteColor,
      title: typeof o.title === "string" ? o.title.slice(0, 200) : "",
    };
  })
  .handler(async ({ data, context }): Promise<NoteDTO> => {
    const { data: r, error } = await context.supabase
      .from("notes")
      .insert({
        user_id: context.userId,
        updated_by: context.userId,
        title: data.title,
        color: data.color,
        content: {},
        content_text: "",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row(r as Record<string, unknown>);
  });

export const updateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as Record<string, unknown>;
    const id = String(o.id ?? "");
    if (!id) throw new Error("id required");
    const p = (o.patch ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (typeof p.title === "string") patch.title = p.title.slice(0, 200);
    if (p.content !== undefined) patch.content = p.content;
    if (typeof p.content_text === "string") patch.content_text = p.content_text.slice(0, 50000);
    if (typeof p.color === "string" && NOTE_COLORS.includes(p.color as NoteColor))
      patch.color = p.color;
    if (Array.isArray(p.tags)) {
      patch.tags = (p.tags as unknown[])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20);
    }
    if (typeof p.is_pinned === "boolean") patch.is_pinned = p.is_pinned;
    if (typeof p.is_favorite === "boolean") patch.is_favorite = p.is_favorite;
    if (typeof p.is_archived === "boolean") patch.is_archived = p.is_archived;
    return { id, patch };
  })
  .handler(async ({ data, context }): Promise<NoteDTO> => {
    const { data: r, error } = await context.supabase
      .from("notes")
      .update({ ...data.patch, updated_by: context.userId })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row(r as Record<string, unknown>);
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ({ id: String((d as { id?: string })?.id ?? "") }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id required");
    const { error } = await context.supabase
      .from("notes")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const noteCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notes")
      .select("is_archived")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { is_archived: boolean }[];
    const total = rows.length;
    const archived = rows.filter((r) => r.is_archived).length;
    return { total, active: total - archived, archived };
  });
