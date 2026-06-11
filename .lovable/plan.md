## Goal
Wire the UI for the server-side export jobs system already in place: preview → background job → realtime progress → signed download. Enforce the `allow_agent_exports` toggle in the UI, apply the styled XLSX formatting to the generic exporter, and add an Audit Log viewer to Settings.

## 1. Reported Errors export flow (`src/routes/_app.my-reported-errors.tsx`)

Replace the current inline `exportReportedErrorsXlsx(filtered, env)` button with a new `ExportReportedErrorsButton` component that:

- Reads `allow_agent_exports` from `app_settings` on mount (or via shared hook).
- Admins: button always enabled.
- Agents: when setting is `false`, button is hidden; when `true`, button enabled and export is scoped to their own rows (already enforced server-side, but UI matches).
- On click → opens `ExportPreviewDialog` (see below) with the current filters + `filtered` rows.
- On "Run export" → calls `createExportJob({ filters })`, gets `jobId`, then subscribes to realtime updates on `export_jobs` for that id, shows progress, and on `completed` calls `getExportDownloadUrl({ jobId })` to trigger a browser download via the signed URL.
- On error → toast, allow retry from the dialog (admins only via `retryExportJob`).

## 2. Export Preview Dialog (`src/components/qa/ExportPreviewDialog.tsx` — new)

Shared dialog used by Reported Errors (and reusable later by Defects). Props: `open`, `onOpenChange`, `rows: Defect[]`, `filters`, `environment`, `onConfirm()`.

Contents:
- Summary row: environment, applied filters (chips), total row count.
- Column list: shows the 8 columns from `REPORTED_ERROR_HEADERS` with a small note "all included".
- Preview table: first 10 rows mapped through `toReportedErrorRow` (Agent, Section, truncated Description, Expected, Screenshot/Link icons, Date Reported).
- Footer: "Cancel" + primary "Run as background job".
- After confirm: switches into "Job progress" mode embedded in the same dialog showing a Progress bar bound to the live `export_jobs` row (status + progress + row_count + error). Buttons swap to "Download" (when completed), "Retry" (admin, when failed), "Close".

A small `useExportJob(jobId)` hook colocated in the dialog file (or `src/lib/qa/useExportJob.ts`) handles the realtime channel + initial select.

## 3. Jobs Panel (`src/components/qa/ExportJobsPanel.tsx` — new)

Card listing recent `export_jobs` (last 25) with realtime updates:
- Columns: Requested by, Scope, Environment, Status badge, Progress, Rows, Started, Actions.
- Actions: Download (if completed and viewer is owner or admin) → uses `getExportDownloadUrl`; Retry (admin only, failed jobs) → uses `retryExportJob`.
- Mounted under Settings → Import / Export (above the Audit Log) so admins/agents can monitor.

## 4. Settings → Audit Log viewer

Extend the existing `audit` tab (`src/routes/_app.settings.tsx`) by adding a new `ExportAuditTable` card alongside the current `AuditTable` and `RoleAuditTable`.

`ExportAuditTable` (admin-only, same tab):
- Fetches `export_audit_log` ordered by `created_at desc`, limit 200.
- Subscribes to inserts via realtime.
- Columns: When, User, Role, Scope, Environment, Filters (collapsible JSON pill), Rows, Status (success/failed), Error.
- Search box + status filter (success / failed / all).
- "Export CSV" button reusing existing `exportCsv`.

Also surface the new `ExportJobsPanel` inside the "Import / Export" tab (admin only) so it's discoverable alongside the agent-export toggle.

## 5. Apply xlsx-js-style formatting in `src/lib/qa/export.ts`

Refactor the generic `exportXlsx` to use `xlsx-js-style` (already a dependency) and the same formatting helpers used by Reported Errors:

- Bold white-on-slate header row.
- Wrap text on any column whose header includes `Description`, `Notes`, `Comments`, `Steps`, `Expected`, `Actual`, `Body`.
- Hyperlink + blue underline for any cell whose value is an `http(s)://` URL.
- Date formatting (`yyyy-mm-dd hh:mm`) for cells whose value is a `Date` instance or whose header includes `Date`, `Created`, `Updated`, `Reported`, `Completed`, `Due` (parse ISO strings to Date before insertion).
- Auto column widths capped to 60 (same as Reported Errors).

Keep the same public signature so existing callsites (settings snapshot, defect/forms exports) keep working — they automatically gain the styling. `exportCsv` stays unchanged.

## 6. Defects export parity

The site-wide Defects exports already go through `exportXlsx` in `src/routes/_app.settings.tsx`. Once step 5 lands, hyperlink/wrap/date rules apply automatically. No additional changes required beyond verifying the snapshot button renders correctly.

## 7. Verification

- Build passes (TS strict).
- Manually verify in preview:
  - Admin: Export button on Reported Errors → preview opens → run job → progress fills → download succeeds → row appears in Audit Log.
  - Admin: simulate a failure (toggle setting off then call as agent) → Retry from Jobs Panel works.
  - Agent with `allow_agent_exports=false`: Export button hidden.
  - Agent with toggle on: only own rows in preview + downloaded file.
  - Settings snapshot Excel: hyperlinks clickable, dates formatted, long text wraps.

## Files

New:
- `src/components/qa/ExportPreviewDialog.tsx`
- `src/components/qa/ExportJobsPanel.tsx`
- `src/lib/qa/useExportJob.ts` (small realtime hook)

Edited:
- `src/routes/_app.my-reported-errors.tsx` (replace Export button + enforce toggle)
- `src/routes/_app.settings.tsx` (add `ExportAuditTable` + mount `ExportJobsPanel`)
- `src/lib/qa/export.ts` (xlsx-js-style + formatting rules)

No DB migrations needed — schema, RLS, and storage bucket already exist.
