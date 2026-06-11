import { createFileRoute } from "@tanstack/react-router";
import { TestingModule } from "@/components/qa/TestingModule";
import { INTEGRATIONS } from "@/lib/qa/constants";

export const Route = createFileRoute("/_app/integrations")({
  component: () => (
    <TestingModule
      title="Integrations"
      description="Test accounting and ERP integrations end-to-end."
      module="Integrations"
      items={INTEGRATIONS}
      itemLabel="integration"
      showHeaderReport={false}
    />
  ),
});