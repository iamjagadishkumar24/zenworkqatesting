// Pure validation used by the Assign Task dialog. Ensures the selected
// forms/features actually belong to the chosen module/integration scope —
// prevents saving an "Integrations → QuickBooks" task with a form that
// belongs to a different integration, or a Forms task tied to an
// unrelated module.

export type AssignableForm = { id: string; name: string; module?: string };

export type AssignmentScopeInput = {
  module: string;                  // selected Module / Category
  allForms: boolean;               // "All Forms" flag bypasses the picker
  pickedIds: Iterable<string>;     // form ids the user selected
  availableForms: AssignableForm[]; // forms allowed for the current scope
  allForms_catalog?: AssignableForm[]; // full catalog, used to name offenders
};

export type AssignmentValidationResult =
  | { ok: true }
  | { ok: false; error: string; offenders: string[] };

export function validateAssignmentScope(
  input: AssignmentScopeInput,
): AssignmentValidationResult {
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