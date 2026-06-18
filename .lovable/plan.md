This request mixes "add tests" with "build new product features" (real-time updates across dashboard/defects/reports). I want to scope it carefully so I don't silently rewrite half the app — and so the tests I add are meaningful (not just rubber-stamp passing).

## What I can do well in this session

### A. Targeted unit/integration tests (vitest)
The repo already uses vitest + jsdom. I'll add focused tests next to existing ones in `src/lib/qa/`:

1. **Defect workflow** (`defect-workflow.test.ts`)
   - Pure-function tests over a defect reducer: add → edit → status transitions (Reported → Pending → Ongoing → Fixed / Retest Required → Closed), validity flips, assigned-agent changes.
   - Asserts audit-trail fields (`updatedBy`, `updatedAt`, version bump) on each transition.
   - Asserts dashboard counts (`total/open/valid/invalid/fixed/retest`) update correctly across each transition.

2. **Role-based access** (`rbac.test.ts`)
   - Table-driven tests over `scopeForUser` + a small `canAccessRoute(role, path)` / `canExport(role)` helper I'll add to `src/lib/qa/scope.ts`. Routes/actions checked:
     - Agent: dashboard, my-reported-errors, my-errors, retest, notifications, settings — yes; agents, audit-log, role admin actions, full-org exports — no.
     - Admin: everything yes.

3. **Export columns & filters** (`export-columns.test.ts`)
   - Asserts `REPORTED_ERROR_HEADERS` matches the documented column list, `toReportedErrorRow` maps each field correctly (form name only, no `Module / Form` prefix), filters by environment + tax year are honored before export, and totals/row counts match input.

4. **Notification self-exclusion** (`notification-routing.test.ts`)
   - Unit-tests a pure helper `shouldNotify(actorId, recipientId)` extracted from `notificationRouting.ts` matching the DB-trigger rule we just shipped.

5. **Tax-year ID sequencing** — already covered by `scoped-id-format.test.ts`; I'll add one DB-shape integration test that hits the live RPC via `supabase.rpc("next_scoped_id", …)` and asserts monotonicity per (kind, tax_year).

### B. Realtime — turn it on, verify with one focused test
Two changes:
1. Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.defects, public.notifications, public.retest_assignments;` + `REPLICA IDENTITY FULL` on each.
2. Wire a single `useDefectsRealtime()` hook in `src/lib/qa/store.tsx` that subscribes once and invalidates the in-memory defects list on insert/update/delete; the dashboard, defects table, and report tiles all read from that store, so they refresh automatically.
3. Add `realtime-channel.test.ts` that mocks `supabase.channel` and asserts the hook subscribes once on mount, handles `INSERT/UPDATE/DELETE`, and unsubscribes on unmount.

### C. Pragmatic light-touch E2E (NOT Playwright)
The harness has no Playwright/installed browser binary and CI cost would be high. Instead I'll add **one** smoke test using React Testing Library that mounts `<Dashboard />` against a seeded in-memory store and asserts:
- KPI counts render
- Disabled state appears when count = 0 with tooltip text
- Click on an enabled KPI navigates (assertion via mocked router)

## What I'm explicitly NOT doing (and why)

- **Full browser E2E suite (login → click through every page → assert delivery of an email).** Requires Playwright + a real Supabase test project + email harness. Multi-day effort, not feasible here.
- **Push/email notification delivery verification.** Email is already exercised by `email.functions.ts`; verifying *delivery* requires a real SMTP inbox. Out of scope.
- **Rebuilding RBAC.** Existing `has_role()` + RLS already enforce server-side; I'll only add the client-side helper + tests.
- **Re-architecting exports.** Current XLSX export is solid; I'll only test it and fix any column mismatches I find.

## Order of execution

1. Realtime migration + store hook.
2. RBAC helper + scope tests.
3. Defect workflow tests.
4. Export tests.
5. Notification routing test.
6. Dashboard smoke test.
7. Run full vitest suite, fix any regressions.

**Confirm before I start:** OK to proceed with this scope (A + B + C above, no Playwright, no email-delivery verification)?
