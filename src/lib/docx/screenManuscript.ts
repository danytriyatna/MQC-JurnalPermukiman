import { parseDocx } from "./parseDocx";
import { runAllChecks, TOTAL_AUTOMATED_RULE_COUNT } from "./rules";
import { FindingDraft, ScreeningResult } from "./types";
import { ManuscriptStatus } from "@/lib/types";

export async function screenManuscript(buffer: Buffer): Promise<ScreeningResult> {
  const doc = await parseDocx(buffer);
  const findings = runAllChecks(doc);

  const automatedFailures = new Set(
    findings.filter((f) => f.checkType === "automated").map((f) => f.ruleId),
  );

  return {
    totalRulesChecked: TOTAL_AUTOMATED_RULE_COUNT,
    totalRulesPassed: Math.max(0, TOTAL_AUTOMATED_RULE_COUNT - automatedFailures.size),
    findings,
  };
}

export function summarize(findings: FindingDraft[]) {
  const errorFindings = findings.filter((f) => f.severity === "error").length;
  const warningFindings = findings.filter((f) => f.severity === "warning").length;
  const status: ManuscriptStatus = errorFindings > 0 ? "needs_revision" : "passed";
  return { errorFindings, warningFindings, status };
}
