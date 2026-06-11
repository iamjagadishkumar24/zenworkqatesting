import { createFileRoute } from "@tanstack/react-router";
import { TestingModule } from "@/components/qa/TestingModule";

const ITEMS = [
  "Vendor Bulk Import",
  "Payee Bulk Import",
  "1099-NEC Excel Template",
  "1099-MISC Excel Template",
  "W-2 Excel Template",
  "TIN Match Bulk Import",
  "Column Mapping",
  "Validation Errors",
  "Large File Upload",
];

export const Route = createFileRoute("/_app/excel-import-testing")({
  component: () => (
    <TestingModule
      title="Excel Import Testing"
      description="QA Excel import templates, column mapping and bulk upload validation."
      module="Excel Import Testing"
      items={ITEMS}
      itemLabel="template"
    />
  ),
});