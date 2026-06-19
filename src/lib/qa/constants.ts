// Canonical lists used across the app — single source of truth.

export const FORM_LIST: string[] = [
  "Form 1099-NEC","Form 1099-MISC","Form 1099-INT","Form 1099-K","Form 1099-DIV",
  "Form 1099-R","Form 1099-S","Form 1099-PATR","Form 1099-B","Form 1099-C",
  "Form 1099-OID","Form 1099-A","Form 1099-SA","Form 1099-Q","Form 1099-G",
  "Form 1099-DA","Form 1099-HC","Form 1099-LS","Form 1097-BTC","Form 1099-QA",
  "Form W-2G","Form 940","Form 941","Form 941-X",
  "Form 943","Form 943-X","Form 944","Form 944-X","Form 945",
  "Form 3921","Form 3922","Form W-2","Form W-2C","Form W-2VI","Form W-2GU",
  "Form 592-B","Form 1095-B","Form 1095-C","Form ACA Corrections",
  "Form 1098","Form 1098-C","Form 1098-T","Form 1098-E",
  "Form 1042","Form 1042-S",
  "Form 480.6A","Form 480.6B","Form 480.6D","Form 480.7A",
  "Form 8809","Form 7004","Form 4868","Form 8027","Form 8868","Form 8955-SSA",
  "Form 5498","Form 5498-SA","Form 5498-ESA",
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

// Shared module/category dropdown options used everywhere (Reported Errors
// filter, Task Assignment, etc.). Keep this as the single source of truth so
// new modules show up in every dropdown automatically.
// The six legacy form categories ("1099 Forms", "990 Forms", "2290 Forms",
// "W-2 Forms", "ACA Forms", "Payroll Forms") were consolidated into a
// single "Forms" entry. Filter logic below maps the unified label back to
// the legacy values so historical defects/tasks still match.
export const FORMS_MODULE = "Forms" as const;
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

export const MODULE_OPTIONS: string[] = [
  FORMS_MODULE,
  "1099 Online",
  "Integrations",
  "Chatbot Testing",
  "Excel Import Testing",
  "Functionality Testing",
  "Tax1099 Features",
];

// Route path for each module — used to deep-link assigned tasks
// from dashboards and the Task Assignments table to the right page.
export const MODULE_ROUTES: Record<string, string> = {
  Forms: "/forms",
  "1099 Forms": "/forms",
  "1099 Online": "/online-1099",
  "990 Forms": "/990-forms",
  "2290 Forms": "/2290-forms",
  "W-2 Forms": "/forms",
  "ACA Forms": "/forms",
  "Payroll Forms": "/forms",
  "Integrations": "/integrations",
  "Chatbot Testing": "/chatbot-testing",
  "Excel Import Testing": "/excel-import-testing",
  "Functionality Testing": "/functionality-testing",
  "Tax1099 Features": "/tax1099-features",
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

export const AGENTS: string[] = Array.from(new Set([
  "Uma Sri Myneni","Manojkumar Sami","Swathi Selam","Mounika Bai Thakur",
  "Nandini Kalal","Karthik Dumathi","Adil Pasha","Jagadish Kumar",
  "Sai Srija Kumbham","Tulasi Ram Chukka","Nikhil Polapally","Sumanth Dasari",
  "Sriram Nandan Basava","Srikanth Bomma","Pavan Kumar Saripalli",
  "Ranjan Somya Mallick","Syed Younus","Rahul Kumar","Pranay Kumar Madapathi",
  "Sohail Shaik","Shahanaz","Patricia Y","Harish Reddy Bobba","Madhuvan Kattla",
  "Mirza Younus Baig",
])).sort((a, b) => a.localeCompare(b));

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

export function decodeFormFeature(ff: string | undefined | null): { form: string; integration: string } {
  if (!ff) return { form: "", integration: "" };
  const idx = ff.indexOf(FF_SEP);
  if (idx === -1) return { form: ff, integration: "" };
  return { form: ff.slice(0, idx), integration: ff.slice(idx + FF_SEP.length) };
}