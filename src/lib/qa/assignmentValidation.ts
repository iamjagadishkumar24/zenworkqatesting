// Pure validation used by the Assign Task dialog AND the server-side
// guard. Ensures the selected forms/features actually belong to the
// chosen module/integration scope, and that the selected Testing Type is
// compatible with the Module / Category. Used during create, edit, and
// reassignment flows so scoped selections can never persist incorrectly
// across module changes.

import {
  FORM_LIST,
  FORMS_MODULE,
  ONLINE_1099_MODULE,
  isFormsModule,
  isOnline1099Module,
  usesFullFormsCatalog,
} from "./constants";

export type AssignableForm = { id: string; name: string; module?: string };

export type AssignmentScopeInput = {
  module: string;                  // selected Module / Category
  testingType?: string;            // selected Testing Type (optional)
  allForms: boolean;               // "All Forms" flag bypasses the picker
  pickedIds: Iterable<string>;     // form ids the user selected
  availableForms: AssignableForm[]; // forms allowed for the current scope
  allForms_catalog?: AssignableForm[]; // full catalog, used to name offenders
};

export type AssignmentValidationResult =
  | { ok: true }
  | { ok: false; error: string; offenders: string[] };

/** Testing-type values that pin the assignment to a specific Module /
 *  Category. Anything not listed here (e.g. "Retest") is freeform and
 *  may be paired with any module. */
const TESTING_TYPE_TO_MODULE: Record<string, string> = {
  "Forms": FORMS_MODULE,
  "1099 Online Forms": ONLINE_1099_MODULE,
  "990 Form Testing": "990 Form Testing",
  "2290 Forms": "2290 Forms",
  "Integrations": "Integrations",
  "Chatbot Testing": "Chatbot Testing",
  "Excel Import Testing": "Excel Import Testing",
  "Functionality Testing": "Functionality Testing",
  "Tax1099 Features": "Tax1099 Features",
};

function sameModule(a: string, b: string): boolean {
  if (a === b) return true;
  if (isFormsModule(a) && isFormsModule(b)) return true;
  if (isOnline1099Module(a) && isOnline1099Module(b)) return true;
  return false;
}

export function validateTestingTypeMatchesModule(
  module: string | null | undefined,
  testingType: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!testingType) return { ok: true };
  const requiredModule = TESTING_TYPE_TO_MODULE[testingType];
  if (!requiredModule) return { ok: true }; // freeform (e.g. Retest)
  if (!module || module === "All Modules") {
    return {
      ok: false,
      error: `Testing Type “${testingType}” requires Module / Category “${requiredModule}”.`,
    };
  }
  if (!sameModule(module, requiredModule)) {
    return {
      ok: false,
      error: `Testing Type “${testingType}” does not match Module / Category “${module}”. Expected “${requiredModule}”.`,
    };
  }
  return { ok: true };
}

export function validateAssignmentScope(
  input: AssignmentScopeInput,
): AssignmentValidationResult {
  // Testing Type ↔ Module / Category gate runs first so the user can
  // correct the mismatch before fighting the per-form check.
  const ttCheck = validateTestingTypeMatchesModule(input.module, input.testingType);
  if (!ttCheck.ok) return { ok: false, error: ttCheck.error, offenders: [] };

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
  const scopeLabel = input.module && input.module !== "All Modules"
    ? `“${input.module}”`
    : "the selected scope";
  const preview = names.slice(0, 3).join(", ") + (names.length > 3 ? `, +${names.length - 3} more` : "");
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
  testingType?: string;
  allForms: boolean;
  formNames: string[];
};

export function validateAssignmentScopeCanonical(
  input: CanonicalScopeInput,
): AssignmentValidationResult {
  const ttCheck = validateTestingTypeMatchesModule(input.module, input.testingType);
  if (!ttCheck.ok) return { ok: false, error: ttCheck.error, offenders: [] };

  if (input.allForms) return { ok: true };
  if (!input.formNames.length) return { ok: true };

  if (usesFullFormsCatalog(input.module)) {
    const allowed = new Set(FORM_LIST);
    const bad = input.formNames.filter((n) => !allowed.has(n));
    if (!bad.length) return { ok: true };
    const preview = bad.slice(0, 3).join(", ") + (bad.length > 3 ? `, +${bad.length - 3} more` : "");
    return {
      ok: false,
      error: `These forms/features are not part of the “${input.module}” catalog: ${preview}.`,
      offenders: bad,
    };
  }

  // Non-catalog modules (Integrations, Chatbot Testing, etc.) carry
  // free-form feature names — the catalog is open-ended. The cross-module
  // gate above is sufficient to block obvious mismatches.
  return { ok: true };
}