import { createFileRoute } from "@tanstack/react-router";
import { FormsCatalog } from "@/components/qa/FormsCatalog";

export const Route = createFileRoute("/_app/forms")({
  component: () => (
    <FormsCatalog
      module="1099 Forms"
      title="Forms"
      description="Every supported tax form. Click any card to report a new defect."
    />
  ),
});