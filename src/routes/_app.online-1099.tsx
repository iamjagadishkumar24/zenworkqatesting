import { createFileRoute } from "@tanstack/react-router";
import { FormsTable } from "@/components/qa/FormsTable";
export const Route = createFileRoute("/_app/online-1099")({
  component: () => <FormsTable module="1099 Online" title="1099 Online" description="Web portal feature testing — login, e-file, payments, PDFs." />,
});
