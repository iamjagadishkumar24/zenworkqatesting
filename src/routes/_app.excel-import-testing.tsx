import { createFileRoute } from "@tanstack/react-router";
import { FormsCatalog } from "@/components/qa/FormsCatalog";

export const Route = createFileRoute("/_app/excel-import-testing")({
  component: () => (
    <FormsCatalog
      module="Excel Import Testing"
      title="Excel Import Testing"
      description="QA Excel import for every supported tax form. Click any card to report a new defect."
      featureMode
    />
  ),
});