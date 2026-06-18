## Goal

Turn the Admin Audit Logs page into a **single, complete, real-time activity monitor** covering every significant action across the QA Portal (defects, tasks/retests, comments, attachments, auth, user management, exports, role changes).

Today the portal already records pieces of this in separate tables:
- `defect_audit_log` (defect field changes + comment edits)
- `agent_audit_log` (agent lifecycle: invite/activate/deactivate/etc.)
- `role_audit_log` (role grants/changes)
- `export_audit_log` (export runs)
- `email_log` (outbound mail)
- `auth.audit_log_entries` (Supabase-managed login/logout/failed logins — read-only)

The current `/audit-log` page only reads `agent_audit_log`. The plan is to **unify** all these streams into one queryable view, fill the gaps (defect create/delete, comment add, retest events, task create/assign, attachment events, session info), and rebuild the page.

---

## 1. Database (single migration)

**New table: `public.activity_log`** — append-only, immutable, the canonical audit stream.

Columns:
- `id uuid pk`
- `occurred_at timestamptz default now()`
- `actor_id uuid` (nullable for system events) + `actor_name`, `actor_email`, `actor_role`
- `category text` — `defect | task | comment | attachment | auth | user_mgmt | role | export | system`
- `action text` — e.g. `defect.created`, `defect.status_changed`, `task.assigned`, `auth.login`, `auth.login_failed`, `user.deactivated`, `export.run`
- `record_type text`, `record_id text` (e.g. defect ZEN-2025-03)
- `defect_id text`, `task_id text`, `form_name text`, `tax_year text`, `environment text`
- `summary text` — human readable
- `old_value jsonb`, `new_value jsonb`
- `result text` — `success | failure`
- `ip_address text`, `user_agent text`, `session_id text`
- `metadata jsonb`

Constraints:
- No UPDATE/DELETE policies (immutable). Only INSERT via SECURITY DEFINER fn + SELECT for admins.
- Index on `(occurred_at desc)`, `(category, occurred_at desc)`, `(actor_id)`, `(defect_id)`, `(task_id)`.
- GRANT SELECT to authenticated (RLS limits to admins); GRANT ALL to service_role.
- Add to `supabase_realtime` publication.

**Helper fn `public.log_activity(...)`** — SECURITY DEFINER insert wrapper used by triggers + server fns.

**Triggers to backfill the stream from existing tables:**
- `defects`: AFTER INSERT/UPDATE/DELETE → emit `defect.created`, `defect.updated`, field-specific events (`status_changed`, `assigned`, `reassigned`, `priority_changed`, `severity_changed`, `validity_changed`, `reopened`, `closed`), `defect.deleted`.
- `defect_comments`: AFTER INSERT → `comment.added`; UPDATE → `comment.edited`; DELETE → `comment.deleted`.
- `retest_assignments`: INSERT → `task.created`/`task.assigned`; UPDATE → `task.reassigned`, `task.status_changed`, `task.completed`, `task.reopened`; DELETE → `task.deleted`.
- `agent_invites` lifecycle changes → `user.*` events.
- `user_roles` → `role.*` (via existing `change_user_role`).
- `export_jobs` AFTER INSERT → `export.run`.
- `auth.audit_log_entries`: NOT mirrored (Supabase-managed). Instead, the login page calls a `recordAuthEvent` server fn after successful sign-in / sign-out / failed sign-in to capture `auth.login`, `auth.logout`, `auth.login_failed` with IP/user-agent. (Supabase auth_logs remain accessible separately for forensic-level detail.)

**Backfill:** one-time INSERT from `defect_audit_log`, `agent_audit_log`, `role_audit_log`, `export_audit_log` into `activity_log` so history is preserved.

---

## 2. Server functions (`src/lib/qa/activity.functions.ts`)

- `recordAuthEvent({ kind, email, success, reason })` — captures login/logout/failed-login with IP + UA from request headers. Public (no auth required for failed-login capture); rate-limited by email.
- `listActivity({ filters, page, pageSize })` — admin-only via `requireSupabaseAuth` + `has_role('admin')`. Supports filters: actor, role, category, action, defect_id, task_id, form_name, tax_year, date range, search text.
- `activityMetrics({ range })` — counts for dashboard widgets (total, today, by category, failed logins).
- `exportActivity({ filters, format })` — returns rows for client-side XLSX/CSV; PDF via existing export pipeline if available, else CSV+XLSX only (PDF deferred — call out in UI tooltip).

---

## 3. Client: `src/routes/_app.audit-log.tsx` rewrite

**Layout:**
- Header + 8 metric tiles (Total, Today, Agent, Admin, Logins, Defects, Tasks, Failed Logins) — clickable to apply filter.
- Filter bar: User (search), Role, Category, Action, Defect ID, Task ID, Tax Year, Form, Date Range, free-text search.
- Table with columns: Time, Actor (name+email+role), Category badge, Action, Record (defect/task link), Form/TaxYear, Summary, Old → New (expandable), IP/UA (popover).
- Row click → side sheet with full JSON diff + metadata.
- Export menu: CSV, XLSX (PDF marked "coming soon" if not wired).
- Realtime: subscribe to `activity_log` INSERTs, prepend to table, bump tile counters.

**RBAC:** admin-only route guard (already present). Agents redirected.

---

## 4. Auth capture wiring

- `src/routes/login.tsx`: on successful `signInWithPassword` → call `recordAuthEvent({ kind:'login', success:true })`. On error → `{ kind:'login_failed', success:false, reason }`.
- `AppShell` sign-out handler → `recordAuthEvent({ kind:'logout' })` before `supabase.auth.signOut()`.
- Password reset request page → `auth.password_reset_requested`.
- Profile/email updates in `_app.settings.tsx` → `user.profile_updated` / `user.email_changed` after successful update.

---

## 5. Tests

- `activity-log.test.ts` — unit: filter predicate, metric aggregation, diff formatter.
- `activity-rbac.test.ts` — only admins can list/export.
- `activity-immutability.test.ts` — UPDATE/DELETE against `activity_log` rejected by RLS (mocked).
- Realtime hook test mirroring existing `useDefectsRealtime` pattern.

---

## 6. Explicit non-goals

- **PDF export**: CSV + XLSX shipped; PDF deferred (would require a server-side renderer not currently configured) — UI shows "Coming soon".
- **Device fingerprinting beyond UA string**: only `user-agent` header + parsed browser/OS, no third-party fingerprint lib.
- **Mirroring Supabase `auth.audit_log_entries`** verbatim: we capture our own auth events at app boundary; Supabase's table remains available for deep forensic queries.
- **Attachment add/delete events**: only wired if the codebase has an attachments table today; otherwise stubbed for future.

---

## Technical notes

- All triggers use SECURITY DEFINER + `search_path=public` (matches existing project convention).
- `activity_log` writes never block the originating transaction — trigger uses `EXCEPTION WHEN OTHERS THEN NULL` so a logging failure can't break a defect update.
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;` + REPLICA IDENTITY FULL.
- Existing `defect_audit_log`, `agent_audit_log`, etc. are **kept** for backward compatibility; new code reads from `activity_log`.
