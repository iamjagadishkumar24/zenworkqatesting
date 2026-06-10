import { createFileRoute } from "@tanstack/react-router";
import { FormsTable } from "@/components/qa/FormsTable";
export const Route = createFileRoute("/_app/forms-990")({
  component: () => <FormsTable module="990 Forms" title="990 Forms" description="Tax-exempt organization form testing." />,
});
