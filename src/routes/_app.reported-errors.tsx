import { createFileRoute, redirect } from "@tanstack/react-router";

// Backward-compat alias: any old link to /reported-errors redirects
// to the canonical Reported Errors page now grouped under Reports.
export const Route = createFileRoute("/_app/reported-errors")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/my-reported-errors", search: search as never, replace: true });
  },
});