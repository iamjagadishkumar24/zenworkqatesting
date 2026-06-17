# Error Reporting & Retest Workflow Overhaul

This is a large, cross-cutting change. Below is the plan I'll execute. I'll confirm before touching code.

## 1. Terminology: Defect → Error (UI only)

Rename across ALL user-facing strings: page titles, nav items, buttons, table headers, toasts, dashboard cards, dialogs, empty states, exports.

- "Report Defect" → "Report Error"
- "Open Defects" → "Open Errors"
- "My Reported Defects" → "My Reported Errors"
- "Defect Details" → "Error Details"
- "Create Defect" → "Create Error"
- Nav item "Defects" → "Errors"

Internal code (DB tables `defects`, types `Defect`, functions `addDefect`, routes `/defects`) will stay as-is to avoid a destructive schema migration and a massive route rename. Only the visible text changes. (If you want me to also rename routes/files/DB, say so — that's a much larger change.)

## 2. Report-Error form simplification

In `ReportDefectDialog.tsx` (and any edit/view surfaces — `DefectDetailSheet.tsx`):

- Remove **Steps to Reproduce** field
- Remove **Actual Result** field
- Remove **Severity** field (everywhere — form, detail, filters, columns, exports)
- Keep **Priority** with options: Low, Medium, High, Critical

The underlying DB columns will stay (to preserve historical data) but be hidden from UI and exports. New errors will leave them null.

## 3. Admin review status

Extend admin review on an error to support these statuses:
`Valid Error`, `Invalid Error`, `Retest Required`, `Fixed`, `Ongoing`, `Pending`.

These map to the existing `defects.status` + `validity` fields. Concretely:
- `Pending` (default), `Ongoing`, `Fixed` → status
- `Valid Error` / `Invalid Error` → validity flag
- `Retest Required` → triggers the retest workflow below

Admin gets a single "Review Status" dropdown in the Error Detail sheet that writes the right combination.

## 4. Invalid Error behavior

When admin sets status to **Invalid Error**:
- Persist validity = Invalid; status label shows "Invalid Error"
- Insert a `notifications` row for the original reporter ("Your error X was marked invalid")
- Record stays visible in admin reports, history, and the agent's "My Reported Errors"
- No deletion

## 5. Retest Required workflow

When admin sets status to **Retest Required**:
- Create a `retest_assignments` row with `assigned_agent_id = original reporter`, linked to the defect id, priority copied, admin comment copied as instructions
- Notify only that agent
- Status on the error becomes "Retest Required"

Reuses the existing `retest_assignments` table — no schema migration needed.

## 6. Agent dashboard: "Retest Errors" section

On `_app.dashboard.tsx`, add a new section **Retest Errors** for the signed-in agent only. Shows their open `retest_assignments`:
- Error title/summary, Form/Module, Priority, Admin comment, Current status, **Open / Retest** action button

## 7. Retest action

Clicking the action opens a dialog where the agent can:
- View the linked error
- Add retest comments
- Set retest result = Passed / Failed
- Add screenshot/recording link (optional)
- Submit → updates `retest_assignments.status` to Completed, notifies admin, writes back to the defect (status → Fixed if Passed, stays Retest Required / reopens if Failed)

## 8. Retest visibility

RLS on `retest_assignments` already scopes to assigned agent. Dashboard query filters by `assigned_agent_id = auth.uid()`. No other agent sees it.

## 9. Admin tracking on Reported Errors page

In Admin "Errors" / Reports views, add columns/fields:
- Original reporting agent
- Retest assigned agent
- Retest status
- Retest comments
- Retest updated date
- Admin review status

## 10. Excel export updates (`exportReportedErrors.ts`)

Remove columns: Steps to Reproduce, Actual Result, Severity.

Keep / add columns (in order):
Date Reported, Agent Name, Section/Form/Module, Error Description, Expected Result/Outcome, Priority, Screenshots/Recordings Link, General Link, Jira Link, Additional Comments, Admin Review Status, Retest Status, Retest Comments, Retest Updated Date.

Join with `retest_assignments` to fill retest columns.

## Files I expect to touch

- `src/components/qa/ReportDefectDialog.tsx` (remove fields, rename labels)
- `src/components/qa/DefectDetailSheet.tsx` (admin review dropdown, retest trigger, hide removed fields)
- `src/components/qa/AppShell.tsx` (nav label)
- `src/routes/_app.dashboard.tsx` (Retest Errors section + rename cards)
- `src/routes/_app.defects.tsx` (rename to "Errors" UI, remove severity column)
- `src/routes/_app.my-reported-errors.tsx`, `_app.my-errors.tsx`, `_app.reports.tsx`, `_app.retest.tsx` (terminology + columns)
- `src/lib/qa/exportReportedErrors.ts` (column changes)
- `src/lib/qa/store.tsx` / `admin.functions.ts` (Retest Required handler creates retest assignment)
- New small dialog: `src/components/qa/RetestSubmitDialog.tsx`

## Things I will NOT do unless you confirm

- Rename DB tables/columns or route file paths (would break historical data + URLs)
- Rename TypeScript types like `Defect` or function names like `addDefect`
- Delete the `severity`, `steps_to_reproduce`, `actual_result` DB columns (kept for historical data, just hidden)

Reply "go" to proceed, or tell me what to adjust.
