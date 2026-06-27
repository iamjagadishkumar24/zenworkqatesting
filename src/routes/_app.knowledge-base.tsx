import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Search,
  Plus,
  Star,
  StarOff,
  Tag as TagIcon,
  FileText,
  HelpCircle,
  GraduationCap,
  Megaphone,
  PlayCircle,
  LifeBuoy,
  ScrollText,
  Download,
  Upload,
  Trash2,
  Pencil,
  Send,
  Archive,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQA } from "@/lib/qa/store";
import { useUserTimeZone } from "@/lib/qa/prefs";
import { formatInTimeZone } from "@/lib/qa/timezones";
import { toast } from "sonner";

type Category =
  | "Articles"
  | "User Guides"
  | "FAQs"
  | "Help Center"
  | "Training Materials"
  | "Documentation"
  | "Release Notes"
  | "Product Announcements"
  | "Video Tutorials";

const CATEGORIES: { id: Category; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "Articles", icon: FileText },
  { id: "User Guides", icon: BookOpen },
  { id: "FAQs", icon: HelpCircle },
  { id: "Help Center", icon: LifeBuoy },
  { id: "Training Materials", icon: GraduationCap },
  { id: "Documentation", icon: ScrollText },
  { id: "Release Notes", icon: ScrollText },
  { id: "Product Announcements", icon: Megaphone },
  { id: "Video Tutorials", icon: PlayCircle },
];

type Article = {
  id: string;
  title: string;
  body: string;
  category: Category;
  tags: string[];
  status: "draft" | "published" | "archived";
  author: string;
  createdAt: string; // ISO UTC
  updatedAt: string; // ISO UTC
  attachments: string[];
  versions: { at: string; by: string; title: string; body: string }[];
};

type AuditEntry = { at: string; by: string; action: string; target: string };

const STORAGE_KEY = "qa.knowledge-base.v1";
const FAV_KEY = "qa.knowledge-base.favorites.v1";
const RECENT_KEY = "qa.knowledge-base.recent.v1";

const SEED: Article[] = [
  {
    id: "kb-welcome",
    title: "Welcome to the Tax1099 Knowledge Base",
    body:
      "Browse articles, FAQs, training materials, and release notes. Use search and filters to find what you need quickly.",
    category: "Articles",
    tags: ["getting-started", "overview"],
    status: "published",
    author: "System",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attachments: [],
    versions: [],
  },
  {
    id: "kb-faq-tin",
    title: "FAQ: How does TIN Matching work?",
    body:
      "TIN Matching validates a recipient's Taxpayer Identification Number against IRS records before filing.",
    category: "FAQs",
    tags: ["tin", "compliance"],
    status: "published",
    author: "System",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attachments: [],
    versions: [],
  },
];

function loadArticles(): Article[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED;
    const parsed = JSON.parse(raw) as Article[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED;
  } catch {
    return SEED;
  }
}

function loadFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(FAV_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function uid() {
  return "kb-" + Math.random().toString(36).slice(2, 10);
}

function KnowledgeBasePage() {
  const { currentUser } = useQA();
  const isAdmin = currentUser?.role === "admin";
  const tz = useUserTimeZone();

  const [articles, setArticles] = useState<Article[]>(() => loadArticles());
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "All">("All");
  const [tagFilter, setTagFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<"All" | Article["status"]>("All");
  const [editor, setEditor] = useState<{ open: boolean; article: Article | null }>({
    open: false,
    article: null,
  });
  const [viewer, setViewer] = useState<Article | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(articles));
    }
  }, [articles]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
    }
  }, [favorites]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    }
  }, [recent]);

  const allTags = useMemo(
    () => Array.from(new Set(articles.flatMap((a) => a.tags))).sort(),
    [articles],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return articles
      .filter((a) => (isAdmin ? true : a.status === "published"))
      .filter((a) => (category === "All" ? true : a.category === category))
      .filter((a) => (tagFilter === "All" ? true : a.tags.includes(tagFilter)))
      .filter((a) => (statusFilter === "All" ? true : a.status === statusFilter))
      .filter(
        (a) =>
          !q ||
          a.title.toLowerCase().includes(q) ||
          a.body.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [articles, search, category, tagFilter, statusFilter, isAdmin]);

  const recentArticles = useMemo(
    () =>
      recent
        .map((id) => articles.find((a) => a.id === id))
        .filter((a): a is Article => Boolean(a))
        .slice(0, 5),
    [recent, articles],
  );
  const favoriteArticles = useMemo(
    () => articles.filter((a) => favorites.includes(a.id)),
    [favorites, articles],
  );

  const log = (action: string, target: string) => {
    setAudit((prev) =>
      [
        { at: new Date().toISOString(), by: currentUser?.name ?? "Anonymous", action, target },
        ...prev,
      ].slice(0, 100),
    );
  };

  const openViewer = (a: Article) => {
    setViewer(a);
    setRecent((prev) => [a.id, ...prev.filter((id) => id !== a.id)].slice(0, 10));
  };

  const toggleFav = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const saveArticle = (a: Article) => {
    setArticles((prev) => {
      const exists = prev.some((x) => x.id === a.id);
      const now = new Date().toISOString();
      const next: Article = { ...a, updatedAt: now };
      if (exists) {
        log("Edited article", a.title);
        return prev.map((x) => (x.id === a.id ? { ...next, versions: [
          ...x.versions,
          { at: x.updatedAt, by: x.author, title: x.title, body: x.body },
        ] } : x));
      }
      log("Created article", a.title);
      return [{ ...next, createdAt: now }, ...prev];
    });
    toast.success("Article saved");
  };

  const deleteArticle = (a: Article) => {
    setArticles((prev) => prev.filter((x) => x.id !== a.id));
    log("Deleted article", a.title);
    toast.success("Article deleted");
  };

  const publishArticle = (a: Article) => {
    setArticles((prev) =>
      prev.map((x) =>
        x.id === a.id ? { ...x, status: "published", updatedAt: new Date().toISOString() } : x,
      ),
    );
    log("Published article", a.title);
    toast.success("Article published");
  };
  const archiveArticle = (a: Article) => {
    setArticles((prev) =>
      prev.map((x) =>
        x.id === a.id ? { ...x, status: "archived", updatedAt: new Date().toISOString() } : x,
      ),
    );
    log("Archived article", a.title);
    toast.success("Article archived");
  };

  const exportKB = () => {
    const blob = new Blob([JSON.stringify(articles, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "knowledge-base.json";
    a.click();
    URL.revokeObjectURL(url);
    log("Exported knowledge base", `${articles.length} articles`);
    toast.success("Knowledge base exported");
  };

  const importKB = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Expected an array of articles");
      const valid = parsed.filter(
        (a) => a && typeof a.id === "string" && typeof a.title === "string",
      ) as Article[];
      if (valid.length === 0) throw new Error("No valid articles in file");
      setArticles(valid);
      log("Imported knowledge base", `${valid.length} articles`);
      toast.success(`Imported ${valid.length} articles`);
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <BookOpen className="h-6 w-6" /> Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground">
            Articles, guides, FAQs, training, and release notes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={exportKB}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          {isAdmin && (
            <>
              <label className="inline-flex">
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importKB(f);
                    e.target.value = "";
                  }}
                />
                <Button asChild variant="outline" size="sm">
                  <span>
                    <Upload className="mr-2 h-4 w-4" /> Import
                  </span>
                </Button>
              </label>
              <Button
                size="sm"
                onClick={() =>
                  setEditor({
                    open: true,
                    article: {
                      id: uid(),
                      title: "",
                      body: "",
                      category: "Articles",
                      tags: [],
                      status: "draft",
                      author: currentUser?.name ?? "Unknown",
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      attachments: [],
                      versions: [],
                    },
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" /> New article
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label htmlFor="kb-search" className="sr-only">
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="kb-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search articles, tags, content…"
                className="pl-8"
              />
            </div>
          </div>
          <Select value={category} onValueChange={(v) => setCategory(v as Category | "All")}>
            <SelectTrigger>
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Tag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All tags</SelectItem>
              {allTags.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isAdmin && (
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="favorites">Favorites ({favoriteArticles.length})</TabsTrigger>
          <TabsTrigger value="recent">Recent</TabsTrigger>
          {isAdmin && <TabsTrigger value="audit">Audit log</TabsTrigger>}
        </TabsList>

        <TabsContent value="browse" className="mt-4">
          {visible.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                No articles match your filters.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((a) => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  tz={tz}
                  favorited={favorites.includes(a.id)}
                  onOpen={() => openViewer(a)}
                  onToggleFav={() => toggleFav(a.id)}
                  canManage={isAdmin}
                  onEdit={() => setEditor({ open: true, article: a })}
                  onDelete={() => deleteArticle(a)}
                  onPublish={() => publishArticle(a)}
                  onArchive={() => archiveArticle(a)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="favorites" className="mt-4">
          {favoriteArticles.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Bookmark articles with the star to find them quickly.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {favoriteArticles.map((a) => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  tz={tz}
                  favorited
                  onOpen={() => openViewer(a)}
                  onToggleFav={() => toggleFav(a.id)}
                  canManage={isAdmin}
                  onEdit={() => setEditor({ open: true, article: a })}
                  onDelete={() => deleteArticle(a)}
                  onPublish={() => publishArticle(a)}
                  onArchive={() => archiveArticle(a)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recent" className="mt-4">
          {recentArticles.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                Articles you open will appear here.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recentArticles.map((a) => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  tz={tz}
                  favorited={favorites.includes(a.id)}
                  onOpen={() => openViewer(a)}
                  onToggleFav={() => toggleFav(a.id)}
                  canManage={isAdmin}
                  onEdit={() => setEditor({ open: true, article: a })}
                  onDelete={() => deleteArticle(a)}
                  onPublish={() => publishArticle(a)}
                  onArchive={() => archiveArticle(a)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Audit log</CardTitle>
                <CardDescription>Knowledge Base activity for this session.</CardDescription>
              </CardHeader>
              <CardContent>
                {audit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {audit.map((e, i) => (
                      <li key={i} className="flex flex-wrap gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatInTimeZone(e.at, tz)}
                        </span>
                        <span className="font-medium">{e.by}</span>
                        <span>{e.action}:</span>
                        <span className="text-muted-foreground">{e.target}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <ArticleEditor
        state={editor}
        onClose={() => setEditor({ open: false, article: null })}
        onSave={saveArticle}
      />
      <ArticleViewer article={viewer} onClose={() => setViewer(null)} tz={tz} />
    </div>
  );
}

function ArticleCard({
  article,
  tz,
  favorited,
  onOpen,
  onToggleFav,
  canManage,
  onEdit,
  onDelete,
  onPublish,
  onArchive,
}: {
  article: Article;
  tz: string;
  favorited: boolean;
  onOpen: () => void;
  onToggleFav: () => void;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
  onArchive: () => void;
}) {
  const Icon = CATEGORIES.find((c) => c.id === article.category)?.icon ?? FileText;
  return (
    <Card className="group flex h-full flex-col transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="flex flex-1 items-center gap-2 text-left"
          >
            <Icon className="h-5 w-5 text-primary" />
            <CardTitle className="text-base leading-snug">{article.title}</CardTitle>
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
            onClick={onToggleFav}
          >
            {favorited ? (
              <Star className="h-4 w-4 fill-current text-amber-500" />
            ) : (
              <StarOff className="h-4 w-4" />
            )}
          </Button>
        </div>
        <CardDescription className="line-clamp-2">{article.body}</CardDescription>
      </CardHeader>
      <CardContent className="mt-auto flex flex-col gap-2 pt-0">
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{article.category}</Badge>
          <Badge variant={article.status === "published" ? "default" : "outline"}>
            {article.status}
          </Badge>
          {article.tags.slice(0, 4).map((t) => (
            <Badge key={t} variant="outline" className="gap-1">
              <TagIcon className="h-3 w-3" />
              {t}
            </Badge>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          Updated {formatInTimeZone(article.updatedAt, tz)} · {article.author}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-1 pt-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
            {article.status !== "published" && (
              <Button variant="ghost" size="sm" onClick={onPublish}>
                <Send className="mr-1 h-3.5 w-3.5" /> Publish
              </Button>
            )}
            {article.status !== "archived" && (
              <Button variant="ghost" size="sm" onClick={onArchive}>
                <Archive className="mr-1 h-3.5 w-3.5" /> Archive
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ArticleEditor({
  state,
  onClose,
  onSave,
}: {
  state: { open: boolean; article: Article | null };
  onClose: () => void;
  onSave: (a: Article) => void;
}) {
  const [draft, setDraft] = useState<Article | null>(state.article);
  useEffect(() => setDraft(state.article), [state.article]);
  if (!state.open || !draft) return null;
  const upd = <K extends keyof Article>(k: K, v: Article[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{state.article?.title ? "Edit article" : "New article"}</DialogTitle>
          <DialogDescription>
            Drafts are only visible to admins. Publish to share with everyone.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Title</Label>
            <Input value={draft.title} onChange={(e) => upd("title", e.target.value)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Category</Label>
              <Select value={draft.category} onValueChange={(v) => upd("category", v as Category)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => upd("status", v as Article["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Tags (comma-separated)</Label>
            <Input
              value={draft.tags.join(", ")}
              onChange={(e) =>
                upd(
                  "tags",
                  e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                )
              }
            />
          </div>
          <div>
            <Label>Body</Label>
            <Textarea
              rows={10}
              value={draft.body}
              onChange={(e) => upd("body", e.target.value)}
              placeholder="Write your article. Markdown-friendly plain text is fine."
            />
          </div>
          <div>
            <Label>Attachment links (one per line)</Label>
            <Textarea
              rows={3}
              value={draft.attachments.join("\n")}
              onChange={(e) =>
                upd(
                  "attachments",
                  e.target.value
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="https://…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!draft.title.trim()) {
                toast.error("Title is required");
                return;
              }
              onSave(draft);
              onClose();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArticleViewer({
  article,
  onClose,
  tz,
}: {
  article: Article | null;
  onClose: () => void;
  tz: string;
}) {
  if (!article) return null;
  return (
    <Dialog open={Boolean(article)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{article.title}</DialogTitle>
          <DialogDescription>
            {article.category} · Updated {formatInTimeZone(article.updatedAt, tz)} ·{" "}
            {article.author}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
          {article.body}
        </div>
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {article.tags.map((t) => (
              <Badge key={t} variant="outline" className="gap-1">
                <TagIcon className="h-3 w-3" />
                {t}
              </Badge>
            ))}
          </div>
        )}
        {article.attachments.length > 0 && (
          <div className="space-y-1 text-sm">
            <div className="font-medium">Attachments</div>
            <ul className="list-disc pl-5">
              {article.attachments.map((u) => (
                <li key={u}>
                  <a className="text-primary underline" href={u} target="_blank" rel="noreferrer">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {article.versions.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">
              Version history ({article.versions.length})
            </summary>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {article.versions.map((v, i) => (
                <li key={i}>
                  {formatInTimeZone(v.at, tz)} — {v.by}: {v.title}
                </li>
              ))}
            </ul>
          </details>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/_app/knowledge-base")({
  component: KnowledgeBasePage,
});