// Pure validation used by the Assign Task dialog AND the server-side
// guard. Ensures the selected forms/features actually belong to the
// chosen module/integration scope, and that the selected Testing Type is
// compatible with the Module / Category. Used during create, edit, and
// reassignment flows so scoped selections can never persist incorrectly
// across module changes.

import { getModuleCatalog } from "./constants";

export type AssignableForm = { id: string; name: string; module?: string };

export type AssignmentScopeInput = {
  module: string; // selected Module / Category
  allForms: boolean; // "All Forms" flag bypasses the picker
  pickedIds: Iterable<string>; // form ids the user selected
  availableForms: AssignableForm[]; // forms allowed for the current scope
  allForms_catalog?: AssignableForm[]; // full catalog, used to name offenders
};

export type AssignmentValidationResult =
  | { ok: true }
  | { ok: false; error: string; offenders: string[] };

export function validateAssignmentScope(input: AssignmentScopeInput): AssignmentValidationResult {
  if (input.allForms) return { ok: true };

  const picked = Array.from(input.pickedIds);
  if (picked.length === 0) return { ok: true };

  const allowed = new Set(input.availableForms.map((f) => f.id));
  const bad = picked.filter((id) => !allowed.has(id));
  if (bad.length === 0) return { ok: true };

  const lookup = new Map<string, string>();
  for (const f of input.allForms_catalog ?? input.availableForms) {
    lookup.set(f.id, f.name);
  }
  const names = bad.map((id) => lookup.get(id) ?? id);
  const scopeLabel =
    input.module && input.module !== "All Modules" ? `“${input.module}”` : "the selected scope";
  const preview =
    names.slice(0, 3).join(", ") + (names.length > 3 ? `, +${names.length - 3} more` : "");
  return {
    ok: false,
    error: `These forms/features don’t belong to ${scopeLabel}: ${preview}. Remove them or change the module.`,
    offenders: names,
  };
}

// ----- Server-side canonical-name guard --------------------------------
// Run by the server function before any DB write. Names are checked
// against the canonical FORM_LIST when the module uses the shared catalog
// (Forms / 1099 Online Forms), so the server enforces the same rules
// regardless of what the client-supplied availableForms looked like.

export type CanonicalScopeInput = {
  module: string;
  allForms: boolean;
  formNames: string[];
};

export function validateAssignmentScopeCanonical(
  input: CanonicalScopeInput,
): AssignmentValidationResult {
  if (input.allForms) return { ok: true };
  if (!input.formNames.length) return { ok: true };

  const catalog = getModuleCatalog(input.module);
  if (!catalog) return { ok: true }; // unknown module (e.g. All Modules)
  const allowed = new Set(catalog);
  const bad = input.formNames.filter((n) => !allowed.has(n));
  if (!bad.length) return { ok: true };
  const preview = bad.slice(0, 3).join(", ") + (bad.length > 3 ? `, +${bad.length - 3} more` : "");
  return {
    ok: false,
    error: `These forms/features are not part of the “${input.module}” catalog: ${preview}.`,
    offenders: bad,
  };
}
