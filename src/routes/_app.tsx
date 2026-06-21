import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/qa/AppShell";
import { useQA } from "@/lib/qa/store";
import { useEnvironment } from "@/lib/qa/environment";

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
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export const Route = createFileRoute("/_app")({ component: AppLayout });
