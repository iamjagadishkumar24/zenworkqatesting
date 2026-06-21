import { createFileRoute } from "@tanstack/react-router";
import { TestingModule } from "@/components/qa/TestingModule";
import { FEATURES_RECIPIENT } from "@/lib/qa/constants";

export const Route = createFileRoute("/_app/recipient-testing")({
  component: () => (
    <TestingModule
      title="Recipient Testing"
      description="QA recipient management, bulk actions, and tax-form workflows."
      module="Recipient"
      items={FEATURES_RECIPIENT}
      itemLabel="feature"
    />
  ),
});