## Why a plan

This request bundles ~6 large initiatives (real-time across every screen, permission-scoped channels, countdown timers, audit, admin-only theme, etc.). Trying to ship all of it in one turn would produce a giant unreviewable change and almost certainly break existing flows (auth, RLS, dashboards). Most of the foundations already exist in this project — `activity_log`, `notifications`, `user_roles` + `has_role`, RLS on user-data tables, audit triggers — so the work is wiring real-time + role gates on top, not rebuilding.

I'll ship it in 4 small, reviewable phases. Pick which one to start with.

---

## Phase 1 — Realtime publication + shared subscription hook (foundation)

**Migration** (one approval):
- `ALTER PUBLICATION supabase_realtime ADD TABLE` for: `defects`, `defect_comments`, `retest_assignments`, `notifications`, `activity_log`.
- `ALTER TABLE ... REPLICA IDENTITY FULL` on the same tables so UPDATE/DELETE payloads include old row (needed for diff-based UI updates).
- Confirm RLS is enabled on each (already is) — Realtime respects RLS, so agents only receive rows they can SELECT. No new policies needed.

**Code**:
- `src/hooks/useRealtimeTable.ts` — single `useEffect`-based hook that opens one channel per table, tears it down on unmount, and calls `queryClient.invalidateQueries({ queryKey })`. Avoids the "subscribe in render" leak.
- Wire it in the screens that already use TanStack Query: Dashboard, Defects list, Defect detail, Retest list, Notifications bell, Activity feed. No business-logic changes — Query refetches and the UI updates.

Deliverable: any admin/agent action triggers a sub-second refresh on every open session for users authorized to see that row.

---

## Phase 2 — Notifications bell + toast, role-scoped

- Subscribe to `notifications` filtered by `user_id=eq.${currentUser.id}` (already RLS-protected; the filter just avoids unnecessary client work).
- Show a `sonner` toast on INSERT, increment unread badge, invalidate the notifications query.
- No schema change — `notifications` and its triggers already exist.

---

## Phase 3 — Live countdown timers for retest tasks

- `useCountdown(deadline_at)` hook: single `setInterval(1000)` shared via context so 50 rows ≠ 50 timers.
- Renders "2d 4h left" / "Overdue by 3h" / stops at `status='Completed'` (column already exists, `deadline_at` already computed by `retest_compute_deadline` trigger).
- Pure frontend — no migration.

---

## Phase 4 — Admin-only theme + agent lockdown

- Add `ThemeProvider` (next-themes-style, class on `<html>`). Default `light`.
- `useQA().currentUser.role === 'admin'` gates: theme toggle in header + Settings → Appearance section.
- Agent sessions: provider forces `light` and ignores any persisted value. Toggle component returns `null` for non-admins.
- Persist admin choice in `localStorage` keyed by user id.

---

## Out of scope for this batch (call out so we don't silently skip)

- Building a brand-new audit pipeline — the existing `activity_log` + `log_activity()` triggers already capture user/action/timestamp/old/new/ip/ua/metadata. Phase 1 makes it live; no new table needed.
- Rewriting RLS — current policies already enforce role isolation via `has_role()`. I'll spot-fix only if Phase 1 surfaces a gap.
- Server-Sent Events / custom WebSocket layer — Supabase Realtime over the existing publication is the supported path and scales fine for this app.

---

## Technical notes

- Realtime channels MUST be created inside `useEffect` with a cleanup that calls `supabase.removeChannel(channel)`. A bare `supabase.channel(...).subscribe()` at component scope leaks subscriptions on every render → reconnect loop → bill spike.
- One channel per logical concern, not per row. Filter server-side with `.on('postgres_changes', { event, schema, table, filter })`.
- `queryClient.invalidateQueries` is the integration point — don't try to merge realtime payloads into Query cache by hand; let the next fetch reconcile with RLS.
- Theme: never read role from `localStorage` to decide — read from the auth store. localStorage role checks are trivially bypassable.

---

## Which phase should I start with?

Reply with **1**, **2**, **3**, or **4** (or "all of phase 1+2"). I'd recommend starting with **Phase 1** because every other phase depends on it.
