import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TestingModule } from "@/components/qa/TestingModule";
import { FEATURES_PAYER, FEATURES_RECIPIENT } from "@/lib/qa/constants";
import { cn } from "@/lib/utils";

// Categories surfaced inside Functionality Testing. Payer and Recipient
// are subcategories — NOT standalone modules, sidebar items, or dashboard
// cards. Their defects are still stored as Module="Functionality Testing"
// with the formFeature encoding "Category · Feature" so the existing
// TestingModule, dashboard counts, and filters keep working unchanged.
const CATEGORIES: { key: string; items: string[] }[] = [
  {
    key: "Forms",
    items: [
      "Unsubmitted Forms",
      "Submitted Forms",
      "Create Reconciliation Forms",
      "Federal/State Rejected Forms",
      "Reconciliation Forms",
      "State Payroll Forms",
    ],
  },
  { key: "Integrations", items: ["File Upload", "Payments", "Notifications"] },
  { key: "Dashboard", items: ["Dashboard"] },
  { key: "Payer", items: FEATURES_PAYER.map((f) => `Payer · ${f}`) },
  { key: "Recipient", items: FEATURES_RECIPIENT.map((f) => `Recipient · ${f}`) },
];

function FunctionalityTestingPage() {
  const [category, setCategory] = useState<string>(CATEGORIES[0].key);
  const active = CATEGORIES.find((c) => c.key === category) ?? CATEGORIES[0];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Functionality Testing categories">
        {CATEGORIES.map((c) => {
          const selected = c.key === category;
          return (
            <button
              key={c.key}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setCategory(c.key)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors",
                selected
                  ? "bg-primary text-primary-foreground ring-primary"
                  : "bg-card text-foreground ring-border hover:bg-accent",
              )}
            >
              {c.key}
            </button>
          );
        })}
      </div>
      <TestingModule
        key={active.key}
        title={`Functionality Testing — ${active.key}`}
        description={`Report and track defects against ${active.key} features.`}
        module="Functionality Testing"
        items={active.items}
        itemLabel="feature"
        showHeaderReport={false}
      />
    </div>
  );
}

export const Route = createFileRoute("/_app/functionality-testing")({
  component: FunctionalityTestingPage,
});
