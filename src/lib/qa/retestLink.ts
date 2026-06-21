// Encode/decode a defect link inside a retest_assignments row.
// We avoid a schema migration by embedding "[DEF:<id>]" at the start of
// the assignment title. This lets us track which reported error a retest
// task is for, and route the agent back to it.

const DEF_TAG_RE = /^\[DEF:([^\]]+)\]\s*/;

export function encodeRetestTitle(defectId: string, errorTitle: string): string {
  return `[DEF:${defectId}] ${errorTitle}`.slice(0, 240);
}

export function extractDefectId(title: string | null | undefined): string | null {
  if (!title) return null;
  const m = DEF_TAG_RE.exec(title);
  return m ? m[1] : null;
}

export function stripDefectTag(title: string | null | undefined): string {
  if (!title) return "";
  return title.replace(DEF_TAG_RE, "");
}

export function isRetestForDefect(title: string | null | undefined): boolean {
  return !!extractDefectId(title);
}
