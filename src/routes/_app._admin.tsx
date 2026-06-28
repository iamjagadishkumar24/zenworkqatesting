import { createFileRoute, Navigate, Outlet, redirect } from "@tanstack/react-router";
import { useQA } from "@/lib/qa/store";
import { supabase } from "@/integrations/supabase/client";

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

/**
 * Defense-in-depth gate: verify the live Supabase session AND admin role via
 * `has_role` before any admin route renders, so direct URL navigation to
 * `/permission-audit`, `/rights-management`, etc. cannot reach the component
 * tree for non-admins even if the in-memory QA store was tampered with.
 * Backend RLS + server-fn admin checks still gate the data itself.
 */
export const Route = createFileRoute("/_app/_admin")({
  beforeLoad: async ({ location }) => {
    // SSR/prerender has no session — skip; the component-level check still runs.
    if (typeof window === "undefined") return;
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    const { data: isAdmin, error } = await supabase.rpc("has_role", {
      _user_id: session.user.id,
      _role: "admin",
    });
    if (error || !isAdmin) {
      throw redirect({ to: "/dashboard", replace: true });
    }
  },
  component: AdminLayout,
});
