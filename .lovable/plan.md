This is a large, multi-area change set spanning the dashboard, ID generation, reports, theming, notifications, workflow audits, DB, APIs, and tests. I want to land it in clearly-scoped phases so each piece is reviewable and safely reversible, rather than as one giant patch that risks regressions across the whole app.

## Phase 1 — Quick, high-impact frontend fixes (no DB risk)

1. **Dashboard cards conditional clickability** (`src/routes/_app.dashboard.tsx`)
   - Build a shared `<KpiCard>` that renders as `<Link>` when `count > 0` and as a non-interactive `<div>` (with `aria-disabled`, `cursor-not-allowed`, reduced opacity, and a "No records available." tooltip) when `count === 0`.
   - Apply to Total Tests, Open / Valid / Invalid / Fixed / Retest Errors and any other summary widgets.

2. **Default Light theme**
   - Force light as the initial value in the theme bootstrap (no `prefers-color-scheme` fallback).
   - Persist user override; if no override, always light. Verify across `__root.tsx` and any theme provider.

3. **Report label formatting**
   - Replace `Module <X> / Form <Y>` strings with just `Form <Y>` everywhere they are produced: dashboard reports, defect detail, exports (PDF/CSV/Excel in `src/lib/qa/export.ts` + `exportReportedErrors.ts`), email templates (`emailTemplates.ts`), notifications.

## Phase 2 — Tax-year-based ID generation (DB migration)

New schema:
```sql
CREATE TABLE public.id_sequences (
  kind text NOT NULL,        -- 'defect' | 'task'
  tax_year text NOT NULL,
  last_seq int NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, tax_year)
);

CREATE OR REPLACE FUNCTION public.next_scoped_id(_kind text, _tax_year text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int; prefix text;
BEGIN
  INSERT INTO id_sequences(kind, tax_year, last_seq) VALUES (_kind, _tax_year, 1)
  ON CONFLICT (kind, tax_year) DO UPDATE SET last_seq = id_sequences.last_seq + 1
  RETURNING last_seq INTO n;
  prefix := CASE _kind WHEN 'defect' THEN 'ZEN' WHEN 'task' THEN 'TASK' END;
  RETURN prefix || '-' || _tax_year || '-' || lpad(n::text, 2, '0');
END $$;
```
- `defects.id` and `retest_assignments.id` stay `text` (already are) so existing rows keep working.
- Server functions that create defects/tasks call `next_scoped_id('defect'|'task', tax_year)` inside the same transaction as the insert — atomic, race-safe via row-level upsert lock.
- Backfill is NOT performed; only new records use the new format. Existing `DEF-*` / `RT-*` ids remain valid.

## Phase 3 — Notification self-exclusion

- Update DB trigger functions `notify_defect_changes`, `notify_defect_comment`, `notify_retest_changes` so every `INSERT INTO notifications` is guarded by `WHERE recipient_uid <> actor_uid`.
- Actor is derived from `NEW.updated_by` / `NEW.created_by` / `NEW.author` via `public.user_id_for_name(...)` (already exists).
- Mirror the rule in any app-level email/notification dispatch in `notificationRouting.ts` and `email.functions.ts`.

## Phase 4 — Workflow, dashboard, DB, API audits + tests (scoped follow-up)

Read-and-verify pass, fixing only concrete defects found:
- Walk error + task state machines end-to-end, confirm status transitions, count refresh, audit log entries.
- Spot-check dashboard counts vs DB with `supabase--read_query`.
- Add focused vitest coverage for: KPI card disabled behavior, `next_scoped_id` formatting, notification self-exclusion routing helper, report label formatter.

## Out of scope for this plan (call out, don't silently do)

- Full responsive/a11y redesign of every page.
- Backfilling old IDs to the new ZEN-/TASK- format.
- Rebuilding the entire API layer or migrating notifications to push.
- 100% E2E coverage — I'll add targeted tests, not a full Playwright suite.

## Recommended order of execution

I'd like to ship Phase 1 first (pure frontend, zero migration risk), then Phase 2 (one migration), then Phase 3 (one migration), then Phase 4. Each phase ends with a build + targeted test run before moving on.

**Question before I start:** do you want me to proceed through all four phases in this session, or stop after Phase 1 so you can verify the UX changes first? Also, confirm: new ID format applies only to **newly created** records — existing `DEF-*` IDs stay as-is — correct?
