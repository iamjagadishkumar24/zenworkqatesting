// Canonical lists used across the app — single source of truth.

export const FORM_LIST: string[] = [
  "Form 1099-NEC",
  "Form 1099-MISC",
  "Form 1099-INT",
  "Form 1099-K",
  "Form 1099-DIV",
  "Form 1099-R",
  "Form 1099-S",
  "Form 1099-PATR",
  "Form 1099-B",
  "Form 1099-C",
  "Form 1099-OID",
  "Form 1099-A",
  "Form 1099-SA",
  "Form 1099-Q",
  "Form 1099-G",
  "Form 1099-DA",
  "Form 1099-HC",
  "Form 1099-LS",
  "Form 1097-BTC",
  "Form 1099-QA",
  "Form W-2G",
  "Form 1099 Corrections",
  "Form 940",
  "Form 941",
  "Form 941-X",
  "Form 943",
  "Form 943-X",
  "Form 944",
  "Form 944-X",
  "Form 945",
  "Form 3921",
  "Form 3922",
  "Form W-2",
  "Form W-2C",
  "Form W-2VI",
  "Form W-2GU",
  "Form 592-B",
  "Form 1095-B",
  "Form 1095-C",
  "Form ACA Corrections",
  "Form 1098",
  "Form 1098-C",
  "Form 1098-T",
  "Form 1098-E",
  "Form 1042",
  "Form 1042-S",
  "Form 480.6A",
  "Form 480.6B",
  "Form 480.6D",
  "Form 480.7A",
  "Form 8809",
  "Form 7004",
  "Form 4868",
  "Form 8027",
  "Form 8868",
  "Form 8955-SSA",
  "Form 5498",
  "Form 5498-SA",
  "Form 5498-ESA",
];

export const INTEGRATIONS: string[] = [
  "QuickBooks Desktop",
  "QuickBooks Online",
  "Bill",
  "Xero",
  "Zoho Books",
  "Sage Intacct",
  "Oracle NetSuite",
  "Entrata",
  "FreshBooks",
];

export const FORMS_2290: string[] = ["EZ2290", "2290.us", "GT2290"];

export const FORMS_990: string[] = [
  "Form 990",
  "Form 990-EZ",
  "Form 990-N",
  "Form 990-PF",
  "Form 990-T",
];

// Curated feature catalogs for non-form modules. These are the *only*
// values the Forms/Features picker is allowed to surface for each module,
// and the server-side guard enforces the same list during create / edit
// / reassignment so a tampered client cannot persist anything else.
export const FEATURES_CHATBOT: string[] = [
  "Chat Widget",
  "Intent Recognition",
  "Knowledge Base",
  "Hand-off to Agent",
  "Conversation History",
  "Analytics",
];
export const FEATURES_EXCEL_IMPORT: string[] = [
  "Template Download",
  "File Upload",
  "Column Mapping",
  "Row Validation",
  "Error Report",
  "Bulk Submit",
];
export const FEATURES_FUNCTIONALITY: string[] = [
  "Login",
  "Sign Up",
  "Password Reset",
  "Dashboard",
  "Notifications",
  "Search",
  "Filters",
  "Exports",
  "Reports",
  "Settings",
];
export const FEATURES_TAX1099: string[] = [
  "TIN Match",
  "W-9 Form",
  "W-8 Form",
  "State Filing",
  "Recipient Portal",
  "Bulk Upload",
  "Corrections",
  "Payments",
  "Audit Trail",
  "PDF",
  "AI Chat Assistance",
  "BOI Reporting",
  "EFTPS",
  "Knowledge Base",
];

// Zenwork Payments — standalone payments module surfaced both in nav and
// as a dashboard card.
export const FEATURES_ZENWORK_PAYMENTS: string[] = [
  "Payer Setup",
  "Recipient Setup",
  "ACH Transfer",
  "Wire Transfer",
  "Check Printing",
  "Payment Scheduling",
  "Payment History",
  "Refunds",
  "Reconciliation",
  "Reporting",
];

// Payer & Recipient feature catalogs — surfaced as standalone testing
// modules so defects can be tagged Module=Payer / Module=Recipient and
// the same dashboard / filter / assignment plumbing applies.
export const FEATURES_PAYER: string[] = [
  "Add Payer",
  "Bulk Upload",
  "Export to Excel",
  "Bulk Delete",
  "Bulk Active or Inactive",
];

export const FEATURES_RECIPIENT: string[] = [
  "Add Recipient",
  "Bulk Upload",
  "Copy Recipient",
  "Delete Recipient",
  "Bulk Address Match",
  "Bulk W9 Request",
  "Bulk W8 Request",
  "Bulk Cancel W9",
  "Bulk Cancel W8",
  "Bulk Inactivate",
  "Bulk Reactivate",
  "Request TIN Match",
  "Request Consent",
  "Export to Excel",
  "Sync to Accounting Software",
  "Bulk Download W8/W9",
];

// Shared module/category dropdown options used everywhere (Reported Errors
// filter, Task Assignment, etc.). Keep this as the single source of truth so
// new modules show up in every dropdown automatically.
// The six legacy form categories ("1099 Forms", "990 Forms", "2290 Forms",
// "W-2 Forms", "ACA Forms", "Payroll Forms") were consolidated into a
// single "Forms" entry. Filter logic below maps the unified label back to
// the legacy values so historical defects/tasks still match.
export const FORMS_MODULE = "Forms" as const;
export const ONLINE_1099_MODULE = "1099 Online Forms" as const;
export const LEGACY_ONLINE_1099_MODULES: readonly string[] = ["1099 Online"];
export const LEGACY_FORM_MODULES: readonly string[] = [
  "1099 Forms",
  "990 Forms",
  "2290 Forms",
  "W-2 Forms",
  "ACA Forms",
  "Payroll Forms",
];

export function isFormsModule(m: string | null | undefined): boolean {
  if (!m) return false;
  return m === FORMS_MODULE || LEGACY_FORM_MODULES.includes(m);
}

export function isOnline1099Module(m: string | null | undefined): boolean {
  if (!m) return false;
  return m === ONLINE_1099_MODULE || LEGACY_ONLINE_1099_MODULES.includes(m);
}

/** Modules whose Forms/Features picker should expose the full FORM_LIST
 *  catalog. Forms and 1099 Online Forms share the same canonical list. */
export function usesFullFormsCatalog(m: string | null | undefined): boolean {
  return isFormsModule(m) || isOnline1099Module(m);
}

/** Canonical, server-enforced catalog of forms/features per module.
 *  This is the single source of truth used by:
 *    1. the Assign Task Forms/Features picker (server-backed listing), and
 *    2. the server-side guard that runs before any DB write.
 *  Returns `null` when the module is unknown (treated as unrestricted,
 *  e.g. "All Modules"). */
export function getModuleCatalog(m: string | null | undefined): string[] | null {
  if (!m) return null;
  // Module-specific catalogs come first — "2290 Forms" and "990 Forms"
  // appear in LEGACY_FORM_MODULES for historical filtering, but their
  // assignment catalogs are the dedicated 2290 / 990 lists, NOT FORM_LIST.
  if (m === "2290 Forms") return [...FORMS_2290];
  if (m === "990 Form Testing" || m === "990 Forms") return [...FORMS_990];
  if (usesFullFormsCatalog(m)) return [...FORM_LIST];
  if (m === "Integrations") return [...INTEGRATIONS];
  if (m === "Chatbot Testing") return [...FEATURES_CHATBOT];
  if (m === "Excel Import Testing") return [...FEATURES_EXCEL_IMPORT];
  if (m === "Functionality Testing") return [...FEATURES_FUNCTIONALITY];
  if (m === "Tax1099 Features") return [...FEATURES_TAX1099];
  if (m === "Zenwork Payments") return [...FEATURES_ZENWORK_PAYMENTS];
  return null;
}

export const MODULE_OPTIONS: string[] = [
  FORMS_MODULE,
  ONLINE_1099_MODULE,
  "990 Form Testing",
  "2290 Forms",
  "Integrations",
  "Chatbot Testing",
  "Excel Import Testing",
  "Functionality Testing",
  "Tax1099 Features",
  "Zenwork Payments",
];

// Route path for each module — used to deep-link assigned tasks
// from dashboards and the Task Assignments table to the right page.
export const MODULE_ROUTES: Record<string, string> = {
  Forms: "/forms",
  "1099 Forms": "/forms",
  "1099 Online": "/online-1099",
  "1099 Online Forms": "/online-1099",
  "990 Forms": "/990-forms",
  "990 Form Testing": "/990-forms",
  "2290 Forms": "/2290-forms",
  "W-2 Forms": "/forms",
  "ACA Forms": "/forms",
  "Payroll Forms": "/forms",
  Integrations: "/integrations",
  "Chatbot Testing": "/chatbot-testing",
  "Excel Import Testing": "/excel-import-testing",
  "Functionality Testing": "/functionality-testing",
  "Tax1099 Features": "/tax1099-features",
  "Zenwork Payments": "/zenwork-payments",
};

export function routeForModule(module: string | null | undefined): string {
  if (!module) return "/retest";
  return MODULE_ROUTES[module] ?? "/retest";
}

export const TEST_MODULES = {
  CHATBOT: "Chatbot Testing",
  FUNCTIONALITY: "Functionality Testing",
  TAX1099: "Tax1099 Features",
} as const;

export const AGENTS: string[] = Array.from(
  new Set([
    "Uma Sri Myneni",
    "Manojkumar Sami",
    "Swathi Selam",
    "Mounika Bai Thakur",
    "Nandini Kalal",
    "Karthik Dumathi",
    "Adil Pasha",
    "Jagadish Kumar",
    "Sai Srija Kumbham",
    "Tulasi Ram Chukka",
    "Nikhil Polapally",
    "Sumanth Dasari",
    "Sriram Nandan Basava",
    "Srikanth Bomma",
    "Pavan Kumar Saripalli",
    "Ranjan Somya Mallick",
    "Syed Younus",
    "Rahul Kumar",
    "Pranay Kumar Madapathi",
    "Sohail Shaik",
    "Shahanaz",
    "Patricia Y",
    "Harish Reddy Bobba",
    "Madhuvan Kattla",
    "Mirza Younus Baig",
  ]),
).sort((a, b) => a.localeCompare(b));

// Encode/decode "Form X · Integration Y" into the existing `formFeature` text column
// so we don't need a schema migration.
export const FF_SEP = " · ";

// Tax year shared options used across Task Assignment, Report Defect,
// filters, and exports.
export const TAX_YEARS = ["2024", "2025", "2026"] as const;
export type TaxYear = (typeof TAX_YEARS)[number];
export const DEFAULT_TAX_YEAR: TaxYear = "2025";

export function encodeFormFeature(form: string, integration?: string): string {
  const f = (form || "").trim();
  const i = (integration || "").trim();
  return i ? `${f}${FF_SEP}${i}` : f;
}

export function decodeFormFeature(ff: string | undefined | null): {
  form: string;
  integration: string;
} {
  if (!ff) return { form: "", integration: "" };
  const idx = ff.indexOf(FF_SEP);
  if (idx === -1) return { form: ff, integration: "" };
  return { form: ff.slice(0, idx), integration: ff.slice(idx + FF_SEP.length) };
}
