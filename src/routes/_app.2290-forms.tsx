import { createFileRoute } from "@tanstack/react-router";
import { TestingModule } from "@/components/qa/TestingModule";
import { FORMS_2290 } from "@/lib/qa/constants";

export const Route = createFileRoute("/_app/2290-forms")({
  component: () => (
    <TestingModule
      title="2290 Forms"
      description="Heavy-vehicle 2290 form testing across EZ2290, 2290.us and GT2290."
      module="1099 Forms"
      items={FORMS_2290}
      itemLabel="form"
    />
  ),
});