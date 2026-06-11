import { createFileRoute } from "@tanstack/react-router";
import { FormsCatalog } from "@/components/qa/FormsCatalog";

export const Route = createFileRoute("/_app/online-1099")({
  component: () => (
    <FormsCatalog
      module="1099 Online"
      title="1099 Online Forms"
      description="Web-portal forms — report defects directly against any online form."
    />
  ),
});
