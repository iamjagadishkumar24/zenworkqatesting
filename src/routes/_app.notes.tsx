import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  type NoteDTO,
  type NoteColor,
  type NoteJSON,
  NOTE_COLORS,
} from "@/lib/qa/notes.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { NoteEditor } from "@/components/qa/NoteEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pin, Star, Archive, Trash2, Plus, Search, ArchiveRestore, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/notes")({
  component: NotesPage,
});

const notesKey = (archived: boolean, search: string, tag: string) =>
  ["notes", { archived, search, tag }] as const;

const COLOR_BG: Record<NoteColor, string> = {
  yellow: "bg-amber-100 dark:bg-amber-500/15 border-amber-200/70 dark:border-amber-500/30",
  blue: "bg-sky-100 dark:bg-sky-500/15 border-sky-200/70 dark:border-sky-500/30",
  green: "bg-emerald-100 dark:bg-emerald-500/15 border-emerald-200/70 dark:border-emerald-500/30",
  red: "bg-rose-100 dark:bg-rose-500/15 border-rose-200/70 dark:border-rose-500/30",
  purple: "bg-violet-100 dark:bg-violet-500/15 border-violet-200/70 dark:border-violet-500/30",
  grey: "bg-slate-100 dark:bg-slate-500/15 border-slate-200/70 dark:border-slate-500/30",
};
const COLOR_DOT: Record<NoteColor, string> = {
  yellow: "bg-amber-400",
  blue: "bg-sky-400",
  green: "bg-emerald-400",
  red: "bg-rose-400",
  purple: "bg-violet-400",
  grey: "bg-slate-400",
};
const COLOR_LABEL: Record<NoteColor, string> = {
  yellow: "Important",
  blue: "Information",
  green: "Completed",
  red: "Urgent",
  purple: "Follow-up",
  grey: "Reference",
};

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function NotesPage() {
  const qc = useQueryClient();
  const [archived, setArchived] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NoteDTO | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listFn = useServerFn(listNotes);
  const createFn = useServerFn(createNote);
  const updateFn = useServerFn(updateNote);
  const deleteFn = useServerFn(deleteNote);

  const opts = queryOptions({
    queryKey: notesKey(archived, search, tag),
    queryFn: () => listFn({ data: { archived, search, tag } }),
  });
  const { data: notes = [], isLoading } = useQuery(opts);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of n.tags) set.add(t);
    return Array.from(set).sort();
  }, [notes]);

  const pinned = notes.filter((n) => n.is_pinned);
  const rest = notes.filter((n) => !n.is_pinned);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notes"] });

  const create = useMutation({
    mutationFn: () => createFn({ data: { color: "yellow", title: "" } }),
    onSuccess: (n) => {
      invalidate();
      setOpenId(n.id);
    },
  });

  const patch = useMutation({
    mutationFn: (v: { id: string; patch: Partial<NoteDTO> }) =>
      updateFn({ data: { id: v.id, patch: v.patch } }),
    onSuccess: () => invalidate(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Note deleted");
    },
  });

  const openNote = notes.find((n) => n.id === openId) ?? null;

  return (
    <div className="space-y-5 animate-fade-in">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold tracking-tight">Quick Notes</h2>
          <p className="text-xs text-muted-foreground">
            Personal sticky notes — autosaved as you type.
          </p>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <Plus className="h-4 w-4" /> New note
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title, content, tags…"
            className="w-72 pl-9"
          />
        </div>
        <Button
          variant={archived ? "secondary" : "outline"}
          size="sm"
          onClick={() => setArchived((a) => !a)}
        >
          {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          {archived ? "Showing archived" : "Active notes"}
        </Button>
        {tag && (
          <Badge variant="secondary" className="gap-1">
            #{tag}
            <button onClick={() => setTag("")} aria-label="Clear tag filter">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {allTags.length > 0 && !tag && (
          <div className="flex flex-wrap gap-1">
            {allTags.slice(0, 12).map((t) => (
              <button
                key={t}
                onClick={() => setTag(t)}
                className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent"
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
              <Plus className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">No {archived ? "archived" : ""} notes yet</p>
            <p className="text-xs text-muted-foreground">
              Capture reminders, follow-ups, and findings without creating a full task.
            </p>
            {!archived && (
              <Button size="sm" className="mt-2" onClick={() => create.mutate()}>
                <Plus className="h-4 w-4" /> Create your first note
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {pinned.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Pinned
              </h3>
              <NoteGrid
                notes={pinned}
                onOpen={setOpenId}
                onPatch={(id, p) => patch.mutate({ id, patch: p })}
                onDelete={(n) => setConfirmDelete(n)}
              />
            </section>
          )}
          {rest.length > 0 && (
            <section className="space-y-2">
              {pinned.length > 0 && (
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes
                </h3>
              )}
              <NoteGrid
                notes={rest}
                onOpen={setOpenId}
                onPatch={(id, p) => patch.mutate({ id, patch: p })}
                onDelete={(n) => setConfirmDelete(n)}
              />
            </section>
          )}
        </>
      )}

      {openNote && (
        <NoteDialog
          note={openNote}
          onClose={() => setOpenId(null)}
          onSave={(p) => patch.mutateAsync({ id: openNote.id, patch: p })}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) remove.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NoteGrid({
  notes,
  onOpen,
  onPatch,
  onDelete,
}: {
  notes: NoteDTO[];
  onOpen: (id: string) => void;
  onPatch: (id: string, p: Partial<NoteDTO>) => void;
  onDelete: (n: NoteDTO) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {notes.map((n) => (
        <div
          key={n.id}
          className={cn(
            "group relative cursor-pointer rounded-xl border p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
            COLOR_BG[n.color],
          )}
          onClick={() => onOpen(n.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-1 text-sm font-semibold">{n.title || "Untitled"}</p>
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <IconBtn
                title={n.is_pinned ? "Unpin" : "Pin"}
                onClick={(e) => {
                  e.stopPropagation();
                  onPatch(n.id, { is_pinned: !n.is_pinned });
                }}
                active={n.is_pinned}
              >
                <Pin className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                title={n.is_favorite ? "Unfavorite" : "Favorite"}
                onClick={(e) => {
                  e.stopPropagation();
                  onPatch(n.id, { is_favorite: !n.is_favorite });
                }}
                active={n.is_favorite}
              >
                <Star className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                title={n.is_archived ? "Unarchive" : "Archive"}
                onClick={(e) => {
                  e.stopPropagation();
                  onPatch(n.id, { is_archived: !n.is_archived });
                }}
              >
                <Archive className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(n);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          </div>
          <p className="mt-1 line-clamp-5 whitespace-pre-wrap text-xs text-foreground/80">
            {n.content_text || <span className="italic text-muted-foreground">Empty note</span>}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {n.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-full bg-background/50 px-1.5 py-0.5 text-[10px] text-foreground/70"
              >
                #{t}
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-foreground/60">
            <span className="inline-flex items-center gap-1">
              <span className={cn("h-1.5 w-1.5 rounded-full", COLOR_DOT[n.color])} />
              {COLOR_LABEL[n.color]}
            </span>
            <span>{timeAgo(n.updated_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "grid h-6 w-6 place-items-center rounded-md text-foreground/70 hover:bg-background/60",
        active && "text-primary",
      )}
    >
      {children}
    </button>
  );
}

function NoteDialog({
  note,
  onClose,
  onSave,
}: {
  note: NoteDTO;
  onClose: () => void;
  onSave: (p: Partial<NoteDTO> & { content?: NoteJSON; content_text?: string }) => Promise<NoteDTO>;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState<NoteJSON>(note.content);
  const [contentText, setContentText] = useState(note.content_text);
  const [color, setColor] = useState<NoteColor>(note.color);
  const [tags, setTags] = useState<string[]>(note.tags);
  const [tagInput, setTagInput] = useState("");
  const [savedAt, setSavedAt] = useState<Date>(new Date(note.updated_at));
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const stateRef = useRef({ title, content, contentText, color, tags });
  stateRef.current = { title, content, contentText, color, tags };

  const doSave = async () => {
    if (!dirtyRef.current) return;
    setSaving(true);
    try {
      const s = stateRef.current;
      const res = await onSave({
        title: s.title,
        content: s.content,
        content_text: s.contentText,
        color: s.color,
        tags: s.tags,
      });
      dirtyRef.current = false;
      setSavedAt(new Date(res.updated_at));
    } finally {
      setSaving(false);
    }
  };

  // Debounce: save 5s after user stops typing
  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = setTimeout(doSave, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, contentText, color, tags]);

  // Interval autosave every 60s
  useEffect(() => {
    const i = setInterval(() => {
      void doSave();
    }, 60000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush on tab hide / unload
  useEffect(() => {
    const flush = () => {
      void doSave();
    };
    window.addEventListener("visibilitychange", flush);
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("visibilitychange", flush);
      window.removeEventListener("beforeunload", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const handleClose = async () => {
    await doSave();
    onClose();
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, "");
    if (!t) return;
    if (tags.includes(t)) {
      setTagInput("");
      return;
    }
    setTags([...tags, t]);
    setTagInput("");
    markDirty();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && void handleClose()}>
      <DialogContent className={cn("max-w-2xl", COLOR_BG[color])}>
        <DialogHeader>
          <DialogTitle className="sr-only">Edit note</DialogTitle>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
            placeholder="Note title"
            className="border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          />
        </DialogHeader>

        <NoteEditor
          value={content}
          placeholder="Write your note…"
          autoFocus
          onChange={({ json, text }) => {
            setContent(json);
            setContentText(text);
            markDirty();
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Color</span>
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                markDirty();
              }}
              title={COLOR_LABEL[c]}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                COLOR_DOT[c],
                color === c ? "border-foreground" : "border-transparent",
              )}
              aria-label={`Color ${COLOR_LABEL[c]}`}
            />
          ))}
        </div>

        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Tags</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                #{t}
                <button
                  type="button"
                  onClick={() => {
                    setTags(tags.filter((x) => x !== t));
                    markDirty();
                  }}
                  aria-label={`Remove tag ${t}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={() => tagInput && addTag()}
              placeholder="Add tag…"
              className="h-7 w-32"
            />
          </div>
        </div>

        <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {saving ? "Saving…" : `Saved · ${timeAgo(savedAt.toISOString())}`}
          </span>
          <Button variant="outline" onClick={handleClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
