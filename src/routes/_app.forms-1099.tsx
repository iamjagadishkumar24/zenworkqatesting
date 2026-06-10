import { createFileRoute } from "@tanstack/react-router";
import { FormsTable } from "@/components/qa/FormsTable";
export const Route = createFileRoute("/_app/forms-1099")({
  component: () => <FormsTable module="1099 Forms" title="1099 Forms" description="Track testing status across all 1099 form types." />,
});
