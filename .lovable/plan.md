## Scope (MVP)

Personal sticky notes for every signed-in user (agent + admin), a "My Quick Notes" dashboard widget, and a refreshed dashboard look. Sharing, team/announcement notes, templates, checklists, analytics, and realtime sync are deferred to a follow-up.

## What ships

### 1. Database (one migration)

`public.notes` table:
- `id uuid pk`, `user_id uuid -> auth.users` (owner)
- `title text`, `content jsonb` (TipTap JSON), `content_text text` (plain text for search)
- `color text` default `'yellow'` — one of yellow/blue/green/red/purple/grey
- `tags text[]` default `'{}'`
- `is_pinned bool`, `is_favorite bool`, `is_archived bool`
- `created_at`, `updated_at` (trigger), `updated_by uuid`

RLS: owner-only SELECT/INSERT/UPDATE/DELETE scoped to `auth.uid() = user_id`. GRANTs to `authenticated` + `service_role`. Index on `(user_id, is_archived, is_pinned, updated_at desc)` and a GIN index on `tags`.

### 2. Server functions (`src/lib/qa/notes.functions.ts`)

All `requireSupabaseAuth`:
- `listNotes({ archived?, search?, tag? })`
- `createNote({})` returns a blank note
- `updateNote({ id, patch })` — used by autosave
- `togglePin / toggleFavorite / toggleArchive({ id })`
- `deleteNote({ id })`

### 3. Rich text editor

Add deps: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`. Wrapper component `NoteEditor` with a minimal toolbar (bold, italic, strike, bullet/ordered list, heading). Emits `{ json, text }` for save.

### 4. Notes UI

New route `src/routes/_app.notes.tsx`:
- Masonry-ish card grid of sticky notes, color-coded with soft tinted backgrounds, rounded corners, subtle shadow + hover lift.
- Toolbar: search box (title/content/tags), tag chips filter, archived toggle, "New note" button.
- Pinned section pinned to top.
- Card actions: pin, favorite, color picker, tag chips, archive, delete (with confirm).
- Clicking a card opens an inline expanded editor (sheet/dialog) with autosave:
  - Debounced save after 5s of inactivity
  - Interval autosave every 60s
  - Save on `visibilitychange`/`beforeunload` via `navigator.sendBeacon`-style flush (we call the server fn synchronously on blur/unmount)
- "Saved · 5s ago" status indicator using `updated_at`.

Add sidebar link "Notes" (StickyNote icon) in `AppShell`.

### 5. Dashboard widget

On `/dashboard`, add `MyQuickNotesWidget`:
- Counts: Total / Active / Archived
- Recent 3 notes (title + color dot + relative time)
- Quick actions: New note, Search (links to /notes), Open Notes

### 6. Dashboard redesign (light touch refresh, not a full rewrite)

Same data and routes — restyled:
- Glassmorphism KPI cards (`bg-card/60 backdrop-blur`, soft gradient border, animated count-up on mount).
- Gradient highlight for the active KPI tone.
- Skeleton loaders while queries resolve.
- Empty-state illustrations (lucide icon in a tinted circle) on each empty section.
- Replace the Modules grid with a bento-style layout (2 wide for top module, others 1× tiles).
- Insert the Quick Notes widget between KPIs and Modules.
- Add hover-lift + `animate-fade-in` on cards.

No new tokens needed beyond what already exists in `styles.css` (`--gradient-primary`, `--shadow-elevated`); add a `--gradient-glass` and `.glass-card` utility in `styles.css` via `@utility`.

## Out of scope (follow-up phases)

- Shared/team notes, admin announcements, permissions, realtime channel
- Templates, checklists with progress, drag-and-drop reordering
- Notes analytics charts, activity log table, notifications
- Mobile drag positioning, offline queue

## Files

- new: `supabase/migrations/<ts>_notes.sql`
- new: `src/lib/qa/notes.functions.ts`
- new: `src/components/qa/NoteEditor.tsx`, `src/components/qa/NoteCard.tsx`, `src/components/qa/MyQuickNotesWidget.tsx`
- new: `src/routes/_app.notes.tsx`
- edited: `src/routes/_app.dashboard.tsx` (widget + restyle), `src/components/qa/AppShell.tsx` (nav link), `src/styles.css` (glass utility), `src/integrations/supabase/types.ts` (after migration)

Approve to start with the migration, then code.