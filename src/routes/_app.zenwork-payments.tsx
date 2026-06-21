import { createFileRoute } from "@tanstack/react-router";
import { TestingModule } from "@/components/qa/TestingModule";
import { FEATURES_ZENWORK_PAYMENTS } from "@/lib/qa/constants";

export const Route = createFileRoute("/_app/zenwork-payments")({
  component: () => (
    <TestingModule
      title="Zenwork Payments"
      description="QA payment workflows across payer, recipient and disbursement features."
      module="Zenwork Payments"
      items={FEATURES_ZENWORK_PAYMENTS}
      itemLabel="feature"
      showHeaderReport={false}
    />
  ),
});
