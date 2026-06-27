import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { useQA } from "@/lib/qa/store";

/**
 * Pathless layout that gates every child route on admin role.
 *
 * Why this is a component-level guard and not `beforeLoad`:
 * Auth state lives in the React `QAProvider` context (`useQA`), not in router
 * context. The parent `_app` layout already redirects unauthenticated users to
 * `/login`, so by the time `_admin` mounts we have `currentUser` available.
 * A `beforeLoad` here would have to re-fetch the session from Supabase on
 * every navigation, duplicating work the parent already did. Centralizing the
 * role check in one component still removes per-route duplication.
 */
function AdminLayout() {
  const { currentUser } = useQA();
  // `_app` ensures currentUser exists; this only runs for signed-in users.
  if (currentUser && currentUser.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}

export const Route = createFileRoute("/_app/_admin")({
  component: AdminLayout,
});
