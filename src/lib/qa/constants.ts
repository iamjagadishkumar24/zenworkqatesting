// Canonical lists used across the app — single source of truth.

export const FORM_LIST: string[] = [
  "Form 1099-NEC","Form 1099-MISC","Form 1099-INT","Form 1099-K","Form 1099-DIV",
  "Form 1099-R","Form 1099-S","Form 1099-PATR","Form 1099-B","Form 1099-C",
  "Form 1099-OID","Form 1099-A","Form 1099-SA","Form 1099-Q","Form 1099-G",
  "Form 1099-DA","Form 1099-HC","Form 1099-LS","Form 1097-BTC","Form 1099-QA",
  "Form W-2G","Form 1099 Corrections","Form 940","Form 941","Form 941-X",
  "Form 943","Form 943-X","Form 944","Form 944-X","Form 945",
  "Form 3921","Form 3922","Form W-2","Form W-2C","Form W-2VI","Form W-2GU",
  "Form 592-B","Form 1095-B","Form 1095-C","Form ACA Corrections",
  "Form 1098","Form 1098-C","Form 1098-T","Form 1098-E",
  "Form 1042","Form 1042-S",
  "Form 480.6A","Form 480.6B","Form 480.6D","Form 480.7A",
  "Form 8809","Form 7004","Form 4868","Form 8027","Form 8868","Form 8955-SSA",
  "Form 5498","Form 5498-SA","Form 5498-ESA","Form 2290",
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