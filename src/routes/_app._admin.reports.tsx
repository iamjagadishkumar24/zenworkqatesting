import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Reports layout. Renders `<Outlet />` so child routes (index + sub-pages
 * such as `/reports/performance`) can mount. RBAC is already enforced by the
 * parent `_app/_admin` layout.
 */
export const Route = createFileRoute("/_app/_admin/reports")({
  component: () => <Outlet />,
});