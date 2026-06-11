import { createFileRoute, Navigate } from "@tanstack/react-router";

// Renamed from /my-errors. Keep the underlying page reachable via redirect.
export const Route = createFileRoute("/_app/my-reported-errors")({
  component: () => <Navigate to="/my-errors" replace />,
});