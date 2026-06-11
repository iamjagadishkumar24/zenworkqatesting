
# Zenwork Testing — Platform Expansion Plan

This is a large, multi-area change. I'll keep the existing login animation, auth, dashboard, defects engine, and database intact, and add new modules around them.

## 1. Environment selection (Production / Stage)

- Add `environment` to client session state via a new `EnvironmentProvider` (React context + `localStorage` key `zenwork.env`).
- After login, if no env is selected, render an `EnvironmentSelect` screen at `/select-environment` instead of `/dashboard`.
- `_app` layout redirects to `/select-environment` whenever `env` is null.
- Header shows current env as a badge and a dropdown to switch (clears query caches and reloads data).
- All defect/form/report queries filter by `environment` column (added to DB).

## 2. Database migration

Add to existing tables:
- `defects.environment text not null default 'Production'` (check Production|Stage)
- `forms.environment text not null default 'Production'`
- New table `notifications (id, user_id, type, title, body, defect_id, read, created_at)` with RLS (user sees own).
- Update `defects.validity` enum usage to also accept `Pending Review | Valid Error | Invalid Error` (keep backwards-compatible with existing `Unverified/Valid/Invalid`). New constant set used in UI; map old values.
- Seed: insert 25 agent profiles into `profiles` (no auth users — they appear as assignable names). Store as a static list in `src/lib/qa/constants.ts` (AGENTS array) since seeding `auth.users` from the client is not possible. Assigned agent is already a free-text name field — using the constant list ensures consistent dropdown.

## 3. Sidebar restructure

Order: Forms, 1099 Online Forms, 2290 Forms, Integrations, Chatbot Testing, Functionality Testing, Tax1099 Features, Dashboard, Defects, My Reported Errors, Reports, Notifications, Settings.

Routes to add:
- `/2290-forms` (sub: EZ2290, 2290.us, GT2290)
- `/integrations` (with the 9 listed integrations, no Excel)
- `/chatbot-testing`
- `/functionality-testing`
- `/tax1099-features`
- `/notifications`
- Rename `/my-errors` → `/my-reported-errors` (keep old as redirect).

Agent role hides admin-only items (none of the new ones are admin-only except Reports + Settings admin sections, which already gate internally).

## 4. Generic TestingModule component

New `src/components/qa/TestingModule.tsx` powers Integrations, Chatbot, Functionality, Tax1099, 2290 sub-forms. Props: `module` name, optional `subItems`. Reuses existing defect list + `ReportDefectDialog` + `DefectDetailSheet` filtered by `module + formFeature + environment`.

## 5. Form Testing Status click fix

Dashboard form rows already exist — make each row a `<Link to="/forms" search={{ q: form.name }}>` so clicking opens Forms filtered to that form. Same for any "form testing status" widget on dashboard.

## 6. Error Validation (admin-only)

Use existing `validity` column. Introduce constants `PENDING_REVIEW | VALID | INVALID`. In `DefectDetailSheet`, validity dropdown is disabled for non-admin. Activity log already records validity changes via the existing `log_defect_changes` trigger.

## 7. Notifications

- New `notifications` table + RLS (`user_id = auth.uid()`).
- `NotificationsBell` (existing) reads from this table in realtime instead of/in addition to current synthesized notifications.
- New `/notifications` page lists all, mark-as-read, empty state.
- Triggers on `defects` insert/update generate notifications for assigned agent (by name → profile lookup) for: assigned, status change, validity change, reassigned, deleted. Comment inserts → notify assigned agent + reporter.

## 8. UI polish

- Sidebar: gradient active state, smooth hover, collapsed icon mode (already supported), env badge in header.
- Cards/badges/modals use existing design tokens (`--gradient-primary`, etc.) — no token churn.

## 9. Out of scope (kept as-is)

- Login page (animation, error boundary, tests untouched).
- Auth flow / Supabase clients.
- Existing dashboard charts.
- Existing defects engine (only adds env filter + validation labels).

## Files to add/change (high level)

- DB migration (1 file): env columns, notifications table+RLS+triggers, validity mapping.
- `src/lib/qa/environment.tsx` (new context).
- `src/lib/qa/constants.ts` (AGENTS list, INTEGRATIONS, TEST_MODULES, FORMS_2290, VALIDATION).
- `src/components/qa/AppShell.tsx` (new sidebar order, env badge/switcher, role filtering).
- `src/components/qa/TestingModule.tsx` (new, generic page).
- `src/components/qa/NotificationsBell.tsx` (realtime from notifications table).
- Routes: `_app.2290-forms.tsx`, `_app.integrations.tsx`, `_app.chatbot-testing.tsx`, `_app.functionality-testing.tsx`, `_app.tax1099-features.tsx`, `_app.notifications.tsx`, `_app.my-reported-errors.tsx`, `_app.select-environment.tsx`.
- `src/routes/_app.tsx` (env guard).
- `src/routes/_app.dashboard.tsx` (clickable form rows, env-filtered, env badge).
- `src/routes/_app.defects.tsx`, `_app.my-errors.tsx`, `_app.reports.tsx`, `_app.forms.tsx`, `_app.online-1099.tsx` (env filter + validation filter).
- `src/components/qa/DefectDetailSheet.tsx` (admin-gated validation, env field).
- `src/components/qa/ReportDefectDialog.tsx` (env auto-tagged, module preset).
- `src/lib/qa/store.tsx` (load env-filtered, notifications realtime).

## Risks / notes

- Adding `environment NOT NULL` to existing rows: default = 'Production' so existing data backfills cleanly.
- Existing `validity` values (`Valid/Invalid/Unverified`) are mapped to (`Valid Error/Invalid Error/Pending Review`) in UI; DB values preserved to avoid breaking the audit trigger.
- Agents are added as constants (not auth users). Creating real auth accounts for 25 people needs admin server-side and their emails — out of scope unless you provide them.

Estimated edits: ~18 files + 1 DB migration. I'll do the migration first, then ship code after it's approved.
