# Agent Management, Task Assignment, Per-Reporter Visibility & Env Scoping

## 1. Agent Management (admin only)

New page **Settings → Agents** (admin-only tab) + DB support for pending invites.

- New table `public.agent_invites` (email, name, status `pending|active|inactive`, notes, created_by). RLS: admins full access; agents may select their own row by email.
- On user signup, `handle_new_user` trigger is extended: if an `agent_invites` row exists for `NEW.email`, mark it `active`, link `user_id`, and ensure `user_roles.role = 'agent'` (override the "first user = admin" branch only when an invite exists).
- Admin UI lists invites + registered agents in one table with status badges (Pending Registration / Active / Inactive), actions: Add Agent (name + email + notes), Deactivate/Activate, Delete (pending only).
- "Add Agent" inserts an invite row; no auth user is created until the person signs up with the matching email.

## 2. Task Assignment — multi-agent + All Forms / Specific Forms

Rework `AssignTaskDialog`:

- Replace single-agent Select with a multi-select chip picker over active agents, plus checkbox "Assign to all active agents" and a new "Include pending agents" toggle (pre-assigns; becomes visible when they register).
- Forms picker gains a top "All Forms" checkbox. When checked, store assignment with `all_forms = true` and zero rows in `retest_assignment_forms`; the agent dashboard then shows every form in the shared `MODULE_OPTIONS`/`forms` list for that environment.
- Add `all_forms boolean default false` column on `retest_assignments`.
- `createAssignment` loops over selected agents (including pending invite ids stored as `pending_email`) and writes one assignment per agent in a single batch.

For pending agents, write a `retest_pending_assignments` row keyed by email + payload JSON. On signup the same trigger materializes those into real `retest_assignments` for the new user_id.

## 3. Per-Reporter Visibility

- `retest_assignments` RLS already scopes agents to `assigned_agent_id = auth.uid()`; keep it.
- `defects` RLS: add policy so agents can `SELECT` only rows where `created_by = current_user_name()` OR `assigned_agent = current_user_name()`. Admins keep full access.
- "Fixed errors" counts/lists in agent dashboard filter by `created_by = me` so an agent only sees their own fixed errors. Admin dashboard remains global.
- My Reported Errors page already filters by reporter; verify it also filters fixed-status updates client-side.

## 4. Environment Toggle Wiring

Audit every list/count surface and ensure it filters by `useEnvironment().env`:

- Dashboard counts (tasks, errors, fixed) — re-derive from `env`-filtered queries.
- Forms catalog, Task Assignment table, Reported Errors, Defects — all already env-aware; add the missing filters in Dashboard tiles.
- Realtime: each list hook already subscribes to its table; on env change, the derived `scoped` arrays recompute, so counts update live. Add a `key={env}` on Dashboard cards so transitions are clean.

## Technical notes

- Migrations: `agent_invites`, `retest_pending_assignments`, `all_forms` column, updated `handle_new_user` trigger, RLS policies + GRANTs.
- New files: `src/routes/_app.agents.tsx` (admin-only), `src/lib/qa/agents.ts` hook, updates to `AssignTaskDialog`, `useRetests.createAssignment`, `_app.dashboard.tsx`, `store.tsx` defect scoping.
- Constants: keep the shared `MODULE_OPTIONS` + `forms` list as the single source of truth for "All Forms".
- No edge functions; all logic via `createServerFn` + RLS.

## Out of scope (call out for follow-up)

- UI redesign / dark premium restyle.
- Highlighting "Assigned" badges across every Forms page (will land in a follow-up after the data model is in place).
