import { createFileRoute, Navigate } from "@tanstack/react-router";

// Defects menu removed — My Reported Errors is the canonical view.
// Keep route to redirect any stale links.
export const Route = createFileRoute("/_app/defects")({
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : undefined,
    filter: typeof s.filter === "string" ? s.filter : undefined,
  }),
  component: () => (
    <Navigate to="/my-reported-errors" search={{ q: undefined, preset: undefined }} replace />
  ),
});
