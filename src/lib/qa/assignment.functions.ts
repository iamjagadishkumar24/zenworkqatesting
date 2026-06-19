// Server-side validation guard for Assign Task create / edit / reassign.
// Runs the canonical scope check on the server so a malicious or buggy
// client can't persist a form/feature that doesn't belong to the chosen
// Module / Category and Testing Type. The DB write itself still happens
// through the regular client (RLS-protected); this fn is the gate.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  validateAssignmentScopeCanonical,
  type AssignmentValidationResult,
} from "./assignmentValidation";
import { getModuleCatalog } from "./constants";

export type ValidateAssignmentInput = {
  module: string;
  allForms: boolean;
  formNames: string[];
};

function parse(input: unknown): ValidateAssignmentInput {
  const d = (input ?? {}) as Record<string, unknown>;
  const module = typeof d.module === "string" ? d.module : "";
  const allForms = !!d.allForms;
  const rawNames = Array.isArray(d.formNames) ? d.formNames : [];
  const formNames = rawNames
    .filter((n): n is string => typeof n === "string")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 500);
  if (module.length > 100) throw new Error("Module is too long");
  return { module, allForms, formNames };
}

export const validateAssignmentScopeServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parse)
  .handler(async ({ data }): Promise<AssignmentValidationResult> => {
    return validateAssignmentScopeCanonical(data);
  });

// Strict server-backed listing for the Assign Task Forms/Features picker.
// The picker MUST render only the records this fn returns. The same
// catalog is enforced by validateAssignmentScopeServer at write time, so
// Create / Edit / Reassign cannot persist anything outside this list.
export type AssignableFormDTO = { id: string; name: string; module: string };

export const listAssignableFormsForModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const d = (input ?? {}) as { module?: unknown };
    const module = typeof d.module === "string" ? d.module : "";
    if (module.length > 100) throw new Error("Module is too long");
    return { module };
  })
  .handler(async ({ data }): Promise<AssignableFormDTO[]> => {
    const catalog = getModuleCatalog(data.module);
    if (!catalog) return [];
    return catalog.map((name) => ({ id: name, name, module: data.module }));
  });

// Server-side paginated / searchable / sortable preview for the Scope
// Preview panel in AssignTaskDialog. Only fetches the current page so the
// dialog doesn't need to ship the full catalog when modules grow large.
//
// Sort keys:
//  - "name"      lexicographic on form name
//  - "version"   numeric revision proxy = (passed + failed) test-run count from public.forms; nulls last
//  - "createdAt" forms.updated_at ISO timestamp (proxy for "created date"); nulls last
export type PreviewSortKey = "name" | "version" | "createdAt";
export type PreviewSortDir = "asc" | "desc";
export type AssignablePreviewItem = {
  id: string;
  name: string;
  module: string;
  version: number | null;
  createdAt: string | null;
};
export type AssignablePreviewResult = {
  items: AssignablePreviewItem[];
  total: number;
  page: number;
  pageSize: number;
};

export const previewAssignableFormsForModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const d = (input ?? {}) as Record<string, unknown>;
    const module = typeof d.module === "string" ? d.module : "";
    const query = typeof d.query === "string" ? d.query.trim() : "";
    const page = Math.max(1, Math.floor(Number(d.page) || 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(d.pageSize) || 24)));
    const sortByRaw = typeof d.sortBy === "string" ? d.sortBy : "name";
    const sortBy: PreviewSortKey = sortByRaw === "version" || sortByRaw === "createdAt" ? sortByRaw : "name";
    const sortDir: PreviewSortDir = d.sortDir === "desc" ? "desc" : "asc";
    if (module.length > 100) throw new Error("Module is too long");
    if (query.length > 200) throw new Error("Query is too long");
    return { module, query, page, pageSize, sortBy, sortDir };
  })
  .handler(async ({ data, context }): Promise<AssignablePreviewResult> => {
    const catalog = getModuleCatalog(data.module);
    if (!catalog) {
      return { items: [], total: 0, page: data.page, pageSize: data.pageSize };
    }
    const { data: rows } = await context.supabase
      .from("forms")
      .select("name, passed, failed, updated_at")
      .in("name", catalog);
    const byName = new Map<string, { version: number | null; createdAt: string | null }>();
    for (const r of rows ?? []) {
      const passed = typeof r.passed === "number" ? r.passed : 0;
      const failed = typeof r.failed === "number" ? r.failed : 0;
      byName.set(
        r.name as string,
        { version: passed + failed, createdAt: (r.updated_at as string | null) ?? null },
      );
    }
    let all: AssignablePreviewItem[] = catalog.map((name) => {
      const meta = byName.get(name) ?? { version: null, createdAt: null };
      return { id: name, name, module: data.module, version: meta.version, createdAt: meta.createdAt };
    });
    if (data.query) {
      const q = data.query.toLowerCase();
      all = all.filter((it) => it.name.toLowerCase().includes(q));
    }
    const dir = data.sortDir === "asc" ? 1 : -1;
    const key = data.sortBy;
    all.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls always last regardless of dir
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    const total = all.length;
    const start = (data.page - 1) * data.pageSize;
    return {
      items: all.slice(start, start + data.pageSize),
      total,
      page: data.page,
      pageSize: data.pageSize,
    };
  });