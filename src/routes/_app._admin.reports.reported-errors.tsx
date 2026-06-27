import { createFileRoute, redirect } from "@tanstack/react-router";

// Alias under the new Reports menu location -> canonical page URL.
export const Route = createFileRoute("/_app/_admin/reports/reported-errors")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/my-reported-errors", search: search as never, replace: true });
  },
});