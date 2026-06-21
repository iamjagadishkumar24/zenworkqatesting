import { createFileRoute } from "@tanstack/react-router";
import { TestingModule } from "@/components/qa/TestingModule";
import { FEATURES_PAYER } from "@/lib/qa/constants";

export const Route = createFileRoute("/_app/payer-testing")({
  component: () => (
    <TestingModule
      title="Payer Testing"
      description="QA payer creation and bulk upload workflows."
      module="Payer"
      items={FEATURES_PAYER}
      itemLabel="feature"
    />
  ),
});