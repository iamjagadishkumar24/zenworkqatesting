import { createFileRoute } from "@tanstack/react-router";
import { FormsTable } from "@/components/qa/FormsTable";
export const Route = createFileRoute("/_app/integrations")({
  component: () => <FormsTable module="Integrations" title="Integrations" description="API and third-party integration test coverage." />,
});
