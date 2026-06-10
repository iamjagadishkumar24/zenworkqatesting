import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/qa/AppShell";
import { useQA } from "@/lib/qa/store";

export const Route = createFileRoute("/_app")({
  component: () => {
    const { currentUser } = useQA();
    if (!currentUser) return <Navigate to="/login" replace />;
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  },
});
