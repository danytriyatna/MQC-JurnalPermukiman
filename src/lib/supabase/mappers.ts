import { Manuscript, ManuscriptStatus } from "@/lib/types";

export interface ManuscriptRow {
  id: string;
  title: string;
  original_file_name: string;
  status: ManuscriptStatus;
  version_number: number;
  total_rules_checked: number;
  total_rules_passed: number;
  error_findings: number;
  warning_findings: number;
  created_at: string;
  updated_at: string;
  uploaded_by_profile: { full_name: string } | { full_name: string }[] | null;
}

export function mapManuscriptRow(row: ManuscriptRow): Manuscript {
  const profile = Array.isArray(row.uploaded_by_profile)
    ? row.uploaded_by_profile[0]
    : row.uploaded_by_profile;

  return {
    id: row.id,
    title: row.title,
    originalFileName: row.original_file_name,
    uploadedBy: profile?.full_name ?? "—",
    status: row.status,
    versionNumber: row.version_number,
    totalRulesChecked: row.total_rules_checked,
    totalRulesPassed: row.total_rules_passed,
    errorFindings: row.error_findings,
    warningFindings: row.warning_findings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
