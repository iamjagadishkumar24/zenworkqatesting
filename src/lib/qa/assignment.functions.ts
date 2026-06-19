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