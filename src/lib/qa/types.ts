export type Role = "admin" | "agent";
export type User = { id: string; name: string; email: string; role: Role; active: boolean };

export type Environment = "Production" | "Stage";
export const ENVIRONMENTS: Environment[] = ["Production", "Stage"];

export type ValidityLabel = "Pending Review" | "Valid Error" | "Invalid Error";
export const VALIDITY_LABELS: ValidityLabel[] = ["Pending Review", "Valid Error", "Invalid Error"];

// DB stores legacy values; map both ways
export function validityToDb(v: ValidityLabel): "Unverified" | "Valid" | "Invalid" {
  if (v === "Valid Error") return "Valid";
  if (v === "Invalid Error") return "Invalid";
  return "Unverified";
}
export function validityFromDb(v: string | undefined | null): ValidityLabel {
  if (v === "Valid") return "Valid Error";
  if (v === "Invalid") return "Invalid Error";
  return "Pending Review";
}

export type TestStatus =
  | "Passed"
  | "Failed"
  | "Open Bug"
  | "In Progress"
  | "Pending"
  | "Retest Required";

export type DefectStatus =
  | "Reported"
  | "Pending"
  | "Ongoing"
  | "In Progress"
  | "Fixed"
  | "Retest Required"
  | "Reopened"
  | "Closed";

export type Priority = "Low" | "Medium" | "High" | "Critical";
export type Severity = "Low" | "Medium" | "High" | "Critical";

export type Module =
  | "1099 Forms"
  | "990 Forms"
  | "Integrations"
  | "1099 Online"
  | "2290 Forms"
  | "Chatbot Testing"
  | "Excel Import Testing"
  | "Functionality Testing"
  | "Tax1099 Features";

export type TestingModule =
  | "1099 Forms"
  | "990 Forms"
  | "Integrations"
  | "1099 Online"
  | "2290 Forms"
  | "Chatbot Testing"
  | "Functionality Testing"
  | "Tax1099 Features";

export type FormItem = {
  id: string;
  name: string;
  module: Module;
  status: TestStatus;
  passed: number;
  failed: number;
  openDefects: number;
  lastTested: string;
  assignedAgent: string;
};

export type Defect = {
  id: string;
  module: Module;
  formFeature: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  expectedResult: string;
  actualResult: string;
  attachmentUrl?: string;
  attachmentUrl2?: string;
  evidenceUrl?: string;
  screenshotUrl?: string;
  videoUrl?: string;
  excelUrl?: string;
  driveUrl?: string;
  jiraUrl?: string;
  status: DefectStatus;
  priority: Priority;
  severity: Severity;
  validity?: "Unverified" | "Valid" | "Invalid";
  environment?: Environment;
  assignedAgent: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  createdBy: string;
  comments: {
    id: string;
    author: string;
    text: string;
    createdAt: string;
    updatedAt?: string;
    updatedBy?: string;
    edited?: boolean;
  }[];
};

export type AuditEntry = {
  id: string;
  defectId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  changedAt: string;
};
