import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQA } from "@/lib/qa/store";

function IndexRedirect() {
  const { currentUser } = useQA();
  return <Navigate to={currentUser ? "/dashboard" : "/login"} replace />;
}

export const Route = createFileRoute("/")({ component: IndexRedirect });
