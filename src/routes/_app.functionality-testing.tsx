import { createFileRoute } from "@tanstack/react-router";
import { TestingModule } from "@/components/qa/TestingModule";

const ITEMS = [
  "Authentication & Login",
  "Dashboard",
  "Reports & Export",
  "Notifications",
  "User Management",
  "Search",
  "File Upload",
  "Payments",
];

export const Route = createFileRoute("/_app/functionality-testing")({
  component: () => (
    <TestingModule
      title="Functionality Testing"
      description="End-to-end functional regression across core platform areas."
      module="Functionality Testing"
      items={ITEMS}
      itemLabel="feature"
    />
  ),
});