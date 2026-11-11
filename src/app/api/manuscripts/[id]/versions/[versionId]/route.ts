import { NextResponse } from "next/server";
import { db, manuscripts, manuscriptVersions, screeningRuns, findings, referenceCheckRuns, referenceChecks, users } from "@/db";
import { eq, and, desc, asc } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id: manuscriptId, versionId } = await params;

  try {
    // 1. Ambil Informasi Versi Spesifik
    const versionRows = await db
      .select({
        id: manuscriptVersions.id,
        manuscriptId: manuscriptVersions.manuscriptId,
        versionNumber: manuscriptVersions.versionNumber,
        originalFileName: manuscriptVersions.originalFileName,
        fileStoragePath: manuscriptVersions.fileStoragePath,
        uploadedAt: manuscriptVersions.uploadedAt,
        parseStatus: manuscriptVersions.parseStatus,
        parseErrorMessage: manuscriptVersions.parseErrorMessage,
        authorName: manuscripts.authorName,
        uploaderName: users.fullName,
      })
      .from(manuscriptVersions)
      .innerJoin(manuscripts, eq(manuscripts.id, manuscriptVersions.manuscriptId))
      .leftJoin(users, eq(users.id, manuscriptVersions.uploadedBy))
      .where(
        and(
          eq(manuscriptVersions.id, versionId),
          eq(manuscriptVersions.manuscriptId, manuscriptId),
        ),
      )
      .limit(1);

    if (versionRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Versi naskah tidak ditemukan." },
        { status: 404 },
      );
    }

    const version = versionRows[0];

    // 2. Ambil Screening Run untuk Versi Ini
    const runRows = await db
      .select({
        id: screeningRuns.id,
        ruleSetVersion: screeningRuns.ruleSetVersion,
        totalRulesChecked: screeningRuns.totalRulesChecked,
        totalRulesPassed: screeningRuns.totalRulesPassed,
        totalRulesFailed: screeningRuns.totalRulesFailed,
        status: screeningRuns.status,
        errorFindings: screeningRuns.errorFindings,
        warningFindings: screeningRuns.warningFindings,
        noticeFindings: screeningRuns.noticeFindings,
        runAt: screeningRuns.runAt,
      })
      .from(screeningRuns)
      .where(eq(screeningRuns.manuscriptVersionId, versionId))
      .orderBy(desc(screeningRuns.runAt))
      .limit(1);

    const run = runRows.length > 0 ? runRows[0] : null;

    // 3. Ambil Temuan Pemeriksaan Format (Findings) untuk Versi Ini
    let versionFindings: any[] = [];
    if (run) {
      const findingRows = await db
        .select({
          id: findings.id,
          section: findings.section,
          ruleId: findings.ruleId,
          ruleName: findings.ruleName,
          severity: findings.severity,
          checkType: findings.checkType,
          message: findings.message,
          location: findings.location,
          currentValue: findings.currentValue,
          expectedValue: findings.expectedValue,
          suggestedFix: findings.suggestedFix,
        })
        .from(findings)
        .where(eq(findings.screeningRunId, run.id))
        .orderBy(findings.severity, findings.createdAt);

      versionFindings = findingRows;
    }

    // 4. Ambil Reference Check Run untuk Versi Ini bila ada
    const refRunRows = await db
      .select({
        id: referenceCheckRuns.id,
        sourceSetVersion: referenceCheckRuns.sourceSetVersion,
        totalReferences: referenceCheckRuns.totalReferences,
        startedAt: referenceCheckRuns.startedAt,
        completedAt: referenceCheckRuns.completedAt,
      })
      .from(referenceCheckRuns)
      .where(eq(referenceCheckRuns.manuscriptVersionId, versionId))
      .orderBy(desc(referenceCheckRuns.startedAt))
      .limit(1);

    let referenceRun: any = null;
    let referenceChecksList: any[] = [];

    if (refRunRows.length > 0) {
      const r = refRunRows[0];
      referenceRun = {
        id: r.id,
        sourceSetVersion: r.sourceSetVersion,
        totalReferences: r.totalReferences,
        startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      };

      const checkRows = await db
        .select({
          id: referenceChecks.id,
          entryIndex: referenceChecks.entryIndex,
          rawText: referenceChecks.rawText,
          kind: referenceChecks.kind,
          doi: referenceChecks.doi,
          url: referenceChecks.url,
          title: referenceChecks.title,
          citedYear: referenceChecks.citedYear,
          verdict: referenceChecks.verdict,
          confidence: referenceChecks.confidence,
          note: referenceChecks.note,
          matchSource: referenceChecks.matchSource,
          matchTitle: referenceChecks.matchTitle,
          matchYear: referenceChecks.matchYear,
          matchUrl: referenceChecks.matchUrl,
          matchSimilarity: referenceChecks.matchSimilarity,
        })
        .from(referenceChecks)
        .where(eq(referenceChecks.runId, r.id))
        .orderBy(asc(referenceChecks.entryIndex));

      referenceChecksList = checkRows;
    }

    return NextResponse.json({
      success: true,
      data: {
        version: {
          id: version.id,
          versionNumber: version.versionNumber,
          originalFileName: version.originalFileName,
          uploadedAt: version.uploadedAt.toISOString(),
          uploadedBy: version.authorName || version.uploaderName || "Penulis OJS",
          parseStatus: version.parseStatus,
          parseErrorMessage: version.parseErrorMessage,
        },
        run: run
          ? {
              id: run.id,
              ruleSetVersion: run.ruleSetVersion,
              totalRulesChecked: run.totalRulesChecked,
              totalRulesPassed: run.totalRulesPassed,
              totalRulesFailed: run.totalRulesFailed,
              status: run.status,
              errorFindings: run.errorFindings,
              warningFindings: run.warningFindings,
              noticeFindings: run.noticeFindings,
              runAt: run.runAt.toISOString(),
            }
          : null,
        findings: versionFindings,
        referenceRun,
        referenceChecks: referenceChecksList,
      },
    });
  } catch (err) {
    console.error("Gagal memuat detail versi naskah:", err);
    return NextResponse.json(
      { success: false, error: "Gagal memuat detail analisis versi naskah." },
      { status: 500 },
    );
  }
}
