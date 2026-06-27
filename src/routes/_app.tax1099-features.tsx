import { createFileRoute } from "@tanstack/react-router";
import { TestingModule } from "@/components/qa/TestingModule";

const ITEMS = [
  "TIN Match",
  "W-9 Form",
  "W-8 Form",
  "Bulk Upload",
  "Vendor Management",
  "State Filing",
  "E-Delivery",
  "Print & Mail",
  "AI Chat Assistance",
  "BOI Reporting",
  "EFTPS",
  "Knowledge Base",
];

export const Route = createFileRoute("/_app/tax1099-features")({
  component: () => (
    <TestingModule
      title="Tax1099 Features"
      description="Validate Tax1099 product features in the selected environment."
      module="Tax1099 Features"
      items={ITEMS}
      itemLabel="feature"
      showHeaderReport={false}
    />
  ),
});
