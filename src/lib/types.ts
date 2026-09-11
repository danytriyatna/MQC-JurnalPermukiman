export type ManuscriptStatus =
  | "processing"
  | "needs_revision"
  | "passed"
  | "processing_failed";

export interface Manuscript {
  id: string;
  title: string;
  originalFileName: string;
  uploadedBy: string;
  status: ManuscriptStatus;
  versionNumber: number;
  totalRulesChecked: number;
  totalRulesPassed: number;
  errorFindings: number;
  warningFindings: number;
  createdAt: string; // ISO8601
  updatedAt: string; // ISO8601
}
