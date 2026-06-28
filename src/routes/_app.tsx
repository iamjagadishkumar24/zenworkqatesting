import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/qa/AppShell";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";
import { PermissionsProvider, moduleForRoute, useCan } from "@/lib/qa/permissions";

function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const moduleName = moduleForRoute(pathname);
  const allowed = useCan(moduleName, "view");
  if (moduleName && !allowed) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <h2 className="text-xl font-semibold">Access restricted</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have permission to view <strong>{moduleName}</strong>. An admin can
          grant access from Rights Management.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}

function AppLayout() {
  const { currentUser } = useQA();
  const { env, ready } = useEnvironment();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!currentUser) return <Navigate to="/login" replace />;
  if (!ready) return null;
  if (!env && pathname !== "/select-environment") {
    return <Navigate to="/select-environment" replace />;
  }
  return (
    <PermissionsProvider>
      <AppShell>
        <ModuleGate>
          <Outlet />
        </ModuleGate>
      </AppShell>
    </PermissionsProvider>
  );
}

export const Route = createFileRoute("/_app")({ component: AppLayout });
