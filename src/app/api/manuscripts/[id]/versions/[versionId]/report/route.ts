import { NextRequest, NextResponse } from "next/server";
import { generateReportDocx, ReportFinding } from "@/lib/docx/generateReport";
import { resolveReviewedByForManuscript, buildOjsReportFileName } from "@/lib/ojs/ojsClient";
import { db, manuscripts as manuscriptsTable, manuscriptVersions, screeningRuns, findings as findingsTable } from "@/db";
import { eq, and, desc } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id: manuscriptId, versionId } = await params;

  try {
    // 1. Ambil Data Induk Naskah
    const manuscriptRows = await db
      .select({
        id: manuscriptsTable.id,
        title: manuscriptsTable.title,
        ojsSubmissionId: manuscriptsTable.ojsSubmissionId,
        assignedEditorName: manuscriptsTable.assignedEditorName,
        assignedEditorFetchedAt: manuscriptsTable.assignedEditorFetchedAt,
      })
      .from(manuscriptsTable)
      .where(eq(manuscriptsTable.id, manuscriptId))
      .limit(1);

    if (manuscriptRows.length === 0) {
      return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
    }

    const manuscript = manuscriptRows[0];

    // 2. Ambil Data Versi Terkait
    const versionRows = await db
      .select({
        id: manuscriptVersions.id,
        versionNumber: manuscriptVersions.versionNumber,
        originalFileName: manuscriptVersions.originalFileName,
        uploadedAt: manuscriptVersions.uploadedAt,
      })
      .from(manuscriptVersions)
      .where(
        and(
          eq(manuscriptVersions.id, versionId),
          eq(manuscriptVersions.manuscriptId, manuscriptId),
        ),
      )
      .limit(1);

    if (versionRows.length === 0) {
      return NextResponse.json({ error: "Versi naskah tidak ditemukan." }, { status: 404 });
    }

    const version = versionRows[0];

    // 3. Ambil Screening Run untuk Versi Ini
    const runRows = await db
      .select({
        id: screeningRuns.id,
        totalRulesChecked: screeningRuns.totalRulesChecked,
        totalRulesPassed: screeningRuns.totalRulesPassed,
        runAt: screeningRuns.runAt,
      })
      .from(screeningRuns)
      .where(eq(screeningRuns.manuscriptVersionId, versionId))
      .orderBy(desc(screeningRuns.runAt))
      .limit(1);

    const run = runRows.length > 0 ? runRows[0] : null;

    // 4. Ambil Temuan Hasil Telaah untuk Versi Ini
    let findings: ReportFinding[] = [];
    if (run) {
      const findingRows = await db
        .select({
          ruleId: findingsTable.ruleId,
          section: findingsTable.section,
          severity: findingsTable.severity,
          checkType: findingsTable.checkType,
          location: findingsTable.location,
          currentValue: findingsTable.currentValue,
          expectedValue: findingsTable.expectedValue,
          suggestedFix: findingsTable.suggestedFix,
        })
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

    // 5. Tentukan Nama Pemeriksa (Editor OJS sesuai Opsi B)
    const reviewedBy = await resolveReviewedByForManuscript({
      id: manuscript.id,
      ojsSubmissionId: manuscript.ojsSubmissionId,
      assignedEditorName: manuscript.assignedEditorName,
      assignedEditorFetchedAt: manuscript.assignedEditorFetchedAt,
    });

    // 6. Buat Berkas Dokumen Laporan DOCX
    const buffer = await generateReportDocx({
      manuscriptTitle: manuscript.title,
      originalFileName: version.originalFileName,
      versionNumber: version.versionNumber,
      reviewedBy,
      reviewedAt: run ? new Date(run.runAt) : new Date(version.uploadedAt),
      totalRulesChecked: run?.totalRulesChecked ?? 0,
      totalRulesPassed: run?.totalRulesPassed ?? 0,
      findings,
    });

    const downloadFileName = buildOjsReportFileName(version.originalFileName);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${downloadFileName}"`,
      },
    });
  } catch (err) {
    console.error("Gagal membuat laporan versi naskah:", err);
    return NextResponse.json(
      { error: "Gagal membuat laporan dokumen Word untuk versi ini." },
      { status: 500 },
    );
  }
}
