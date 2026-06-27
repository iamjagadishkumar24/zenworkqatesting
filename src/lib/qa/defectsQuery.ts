import { supabase } from "@/integrations/supabase/client";

export type DefectQuerySpec = {
  environment?: string | null;
  taxYear?: string;
  statusGroup?:
    | "all"
    | "Open"
    | "Fixed"
    | "Retest Required"
    | "Valid"
    | "Invalid"
    | "Pending Review";
  testingType?: string;
  category?: string;
  agent?: string;
  validity?: "Valid" | "Invalid" | "Pending Review";
  module?: string;
  from?: string | null;
  to?: string | null;
};

export type DefectSort = { key: string; dir: "asc" | "desc" };

export type DefectRowLite = {
  id: string;
  module: string;
  formFeature: string;
  title: string;
  status: string;
  validityLabel: string;
  priority: string;
  severity: string;
  assignedAgent: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

const SORT_COLUMN: Record<string, string> = {
  id: "id",
  module: "module",
  formFeature: "form_feature",
  title: "title",
  status: "status",
  validityLabel: "validity",
  priority: "priority",
  severity: "severity",
  assignedAgent: "assigned_agent",
  createdBy: "created_by",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

type Row = Record<string, unknown>;

function mapRow(r: Row): DefectRowLite {
  const v = (r.validity as string | null) ?? null;
  return {
    id: String(r.id ?? ""),
    module: String(r.module ?? ""),
    formFeature: String(r.form_feature ?? ""),
    title: String(r.title ?? ""),
    status: String(r.status ?? ""),
    validityLabel: !v || v === "Unverified" ? "Pending Review" : v,
    priority: String(r.priority ?? ""),
    severity: String(r.severity ?? ""),
    assignedAgent: String(r.assigned_agent ?? ""),
    createdBy: String(r.created_by ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

// Loose builder shape: we share one helper between the count and the paged
// query so PostgREST's chained types don't need to be threaded through every
// conditional. RLS still enforces row access. We type the builder as
// `unknown` internally and cast through a minimal chainable shape per call —
// keeps `any` out of the file without re-deriving Postgrest's full generics.
type Chain = {
  eq: (c: string, v: unknown) => Chain;
  ilike: (c: string, v: string) => Chain;
  or: (e: string) => Chain;
  gte: (c: string, v: unknown) => Chain;
  lt: (c: string, v: unknown) => Chain;
  in: (c: string, v: unknown[]) => Chain;
  not: (c: string, op: string, v: unknown) => Chain;
};
function applySpec<Q>(qIn: Q, spec: DefectQuerySpec): Q {
  let q = qIn as unknown as Chain;
  if (spec.environment) q = q.eq("environment", spec.environment);
  if (spec.taxYear && spec.taxYear !== "all") q = q.eq("tax_year", spec.taxYear);
  if (spec.module) q = q.eq("module", spec.module);
  else if (spec.category && spec.category !== "all") q = q.eq("module", spec.category);
  if (spec.testingType && spec.testingType !== "all")
    q = q.ilike("module", `%${spec.testingType}%`);
  if (spec.agent && spec.agent !== "all")
    q = q.or(`assigned_agent.eq.${spec.agent},created_by.eq.${spec.agent}`);
  if (spec.from) q = q.gte("created_at", spec.from);
  if (spec.to) q = q.lt("created_at", spec.to);

  if (spec.validity === "Valid") q = q.eq("validity", "Valid");
  else if (spec.validity === "Invalid") q = q.eq("validity", "Invalid");
  else if (spec.validity === "Pending Review") q = q.or("validity.is.null,validity.eq.Unverified");

  switch (spec.statusGroup) {
    case "Open":
      q = q.not("status", "in", "(Fixed,Closed)");
      break;
    case "Fixed":
      q = q.in("status", ["Fixed", "Closed"]);
      break;
    case "Retest Required":
      q = q.eq("status", "Retest Required");
      break;
    case "Valid":
      q = q.eq("validity", "Valid");
      break;
    case "Invalid":
      q = q.eq("validity", "Invalid");
      break;
    case "Pending Review":
      q = q.or("validity.is.null,validity.eq.Unverified");
      break;
    default:
      break;
  }
  return q as unknown as Q;
}

export async function queryDefectsPage(
  spec: DefectQuerySpec,
  sort: DefectSort,
  page: number,
  pageSize: number,
): Promise<{ rows: DefectRowLite[]; total: number }> {
  const col = SORT_COLUMN[sort.key] ?? "created_at";
  const from = Math.max(0, (page - 1) * pageSize);
  const to = from + pageSize - 1;
  let q = supabase.from("defects").select("*", { count: "exact" });
  q = applySpec(q, spec);
  // Always include a deterministic tie-breaker (id) so rows don't shift
  // between pages when the primary sort column has duplicates or when
  // other rows are mutated concurrently.
  q = q.order(col, { ascending: sort.dir === "asc" });
  if (col !== "id") q = q.order("id", { ascending: true });
  q = q.range(from, to);
  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: (data ?? []).map((r) => mapRow(r as Row)), total: count ?? 0 };
}

// Pull every matching row (in chunks) for "export all" actions.
export async function queryDefectsAll(
  spec: DefectQuerySpec,
  sort: DefectSort,
  cap = 5000,
): Promise<DefectRowLite[]> {
  const out: DefectRowLite[] = [];
  const chunk = 1000;
  for (let page = 1; out.length < cap; page++) {
    const { rows, total } = await queryDefectsPage(spec, sort, page, chunk);
    out.push(...rows);
    if (rows.length < chunk || out.length >= total) break;
  }
  return out.slice(0, cap);
}
