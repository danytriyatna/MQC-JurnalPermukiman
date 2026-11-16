import { NextRequest, NextResponse } from "next/server";
import { generateReportDocx, ReportFinding } from "@/lib/docx/generateReport";
import { requireStaffOrInspectionToken } from "@/lib/auth/guard";
import { resolveReviewedByForManuscript, buildOjsReportFileName } from "@/lib/ojs/ojsClient";
import { db, manuscripts as manuscriptsTable, screeningRuns, findings as findingsTable, users } from "@/db";
import { eq, desc } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const authResult = await requireStaffOrInspectionToken(request, id);
  if (authResult.errorResponse) {
    return authResult.errorResponse;
  }

  // 2. Coba ambil naskah dari basis data lokal PostgreSQL (mqc_db)
  let manuscriptData: any = null;
  let findings: ReportFinding[] = [];

  try {
    const rows = await db
      .select({
        id: manuscriptsTable.id,
        title: manuscriptsTable.title,
        original_file_name: manuscriptsTable.originalFileName,
        version_number: manuscriptsTable.versionNumber,
        total_rules_checked: manuscriptsTable.totalRulesChecked,
        total_rules_passed: manuscriptsTable.totalRulesPassed,
        current_version_id: manuscriptsTable.currentVersionId,
        updated_at: manuscriptsTable.updatedAt,
        author_name: manuscriptsTable.authorName,
        ojs_submission_id: manuscriptsTable.ojsSubmissionId,
        assigned_editor_name: manuscriptsTable.assignedEditorName,
        assigned_editor_fetched_at: manuscriptsTable.assignedEditorFetchedAt,
        uploader_name: users.fullName,
      })
      .from(manuscriptsTable)
      .leftJoin(users, eq(users.id, manuscriptsTable.uploadedBy))
      .where(eq(manuscriptsTable.id, id))
      .limit(1);

    if (rows.length > 0) {
      manuscriptData = rows[0];

      if (manuscriptData.current_version_id) {
        const runRows = await db
          .select()
          .from(screeningRuns)
          .where(eq(screeningRuns.manuscriptVersionId, manuscriptData.current_version_id))
          .orderBy(desc(screeningRuns.runAt))
          .limit(1);

        if (runRows.length > 0) {
          const run = runRows[0];
          const findingRows = await db
            .select()
            .from(findingsTable)
            .where(eq(findingsTable.screeningRunId, run.id));

          findings = findingRows.map((f) => ({
            ruleId: f.ruleId,
            section: f.section as any,
            severity: f.severity as any,
            checkType: f.checkType as any,
            location: f.location,
            currentValue: f.currentValue,
            expectedValue: f.expectedValue,
            suggestedFix: f.suggestedFix,
          }));
        }
      }
    }
  } catch (err) {
    console.error("Gagal membaca naskah dari Drizzle untuk report:", err);
  }

  if (!manuscriptData) {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }

  const reviewedBy = await resolveReviewedByForManuscript({
    id: manuscriptData.id,
    ojsSubmissionId: manuscriptData.ojs_submission_id,
    assignedEditorName: manuscriptData.assigned_editor_name,
    assignedEditorFetchedAt: manuscriptData.assigned_editor_fetched_at,
  });

  let buffer: Buffer;
  try {
    buffer = await generateReportDocx({
      manuscriptTitle: manuscriptData.title,
      originalFileName: manuscriptData.original_file_name,
      versionNumber: manuscriptData.version_number,
      reviewedBy,
      reviewedAt: new Date(manuscriptData.updated_at),
      totalRulesChecked: manuscriptData.total_rules_checked,
      totalRulesPassed: manuscriptData.total_rules_passed,
      findings,
    });
  } catch {
    return NextResponse.json({ error: "Gagal membuat laporan dokumen Word." }, { status: 500 });
  }

  const downloadFileName = buildOjsReportFileName(manuscriptData.original_file_name);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${downloadFileName}"`,
    },
  });
}
