import { createFileRoute } from "@tanstack/react-router";
import { FormsCatalog } from "@/components/qa/FormsCatalog";

const FORMS_990 = ["Form 990", "Form 990-N", "Form 990-T", "Form 990-PF", "Form 990-EZ"];

export const Route = createFileRoute("/_app/990-forms")({
  component: () => (
    <FormsCatalog
      module="990 Forms"
      title="990 Form Testing"
      description="Nonprofit 990 series — report defects directly against any 990 form."
      forms={FORMS_990}
      featureMode
    />
  ),
});
