import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQA } from "@/lib/qa/store";

export const Route = createFileRoute("/")({
  component: () => {
    const { currentUser } = useQA();
    return <Navigate to={currentUser ? "/dashboard" : "/login"} replace />;
  },
});
