import { NextRequest, NextResponse } from "next/server";
import { screenManuscript, summarize } from "@/lib/docx/screenManuscript";
import { generateReportDocx, ReportFinding } from "@/lib/docx/generateReport";
import { readManuscriptFile } from "@/lib/storage/localStorage";
import {
  resolveReviewedByForManuscript,
  uploadOrUpdateReportToOjs,
  buildOjsReportFileName,
  getAssignedEditorFromOjs,
} from "@/lib/ojs/ojsClient";
import { buildJobIdempotencyKey } from "@/lib/queue/screeningQueue";
import { db, manuscripts, manuscriptVersions, screeningRuns, findings, screeningJobs } from "@/db";
import { eq, desc } from "drizzle-orm";
import { ManuscriptStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function getCorsHeaders(): Record<string, string> {
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN?.trim() || "http://localhost:8000";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-mqc-api-key",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders();
  let body: { manuscriptIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Format payload request harus berupa JSON." },
      { status: 400, headers: corsHeaders },
    );
  }

  if (!body || typeof body !== "object" || !Array.isArray(body.manuscriptIds)) {
    return NextResponse.json(
      { success: false, error: "manuscriptIds wajib berupa array string UUID naskah." },
      { status: 400, headers: corsHeaders },
    );
  }

  const rawIds = body.manuscriptIds.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );
  // Hindari duplikasi ID dalam satu batch
  const manuscriptIds = Array.from(new Set(rawIds));

  if (manuscriptIds.length === 0) {
    return NextResponse.json(
      { success: true, processedCount: 0, results: [] },
      { status: 200, headers: corsHeaders },
    );
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const results: Array<{
    manuscriptId: string;
    success: boolean;
    status?: ManuscriptStatus;
    score?: number;
    passed?: boolean;
    error?: string;
    summary?: {
      totalChecked: number;
      totalPassed: number;
      errorCount: number;
      warningCount: number;
    };
  }> = [];

  for (const manuscriptId of manuscriptIds) {
    try {
      // Validasi format UUID terlebih dahulu sebelum kueri database
      if (!UUID_REGEX.test(manuscriptId)) {
        results.push({
          manuscriptId,
          success: false,
          error: "Format ID naskah tidak valid (harus berupa UUID).",
        });
        continue;
      }

      // 1. Ambil baris naskah induk
      const msRows = await db
        .select()
        .from(manuscripts)
        .where(eq(manuscripts.id, manuscriptId))
        .limit(1);

      if (msRows.length === 0) {
        results.push({
          manuscriptId,
          success: false,
          error: "Naskah tidak ditemukan dalam database.",
        });
        continue;
      }

      const manuscript = msRows[0];

      // 1b. Validasi Penugasan Editor di OJS (Strict Gating)
      // Naskah dari OJS wajib sudah memiliki Editor yang ditugaskan di OJS sebelum pemeriksaan MQC dijalankan
      if (typeof manuscript.ojsSubmissionId === "number" && manuscript.ojsSubmissionId > 0) {
        let assignedEditor = manuscript.assignedEditorName;
        if (!assignedEditor || assignedEditor.trim().length === 0) {
          const lookup = await getAssignedEditorFromOjs(manuscript.ojsSubmissionId);
          if (lookup.editorName) {
            assignedEditor = lookup.editorName;
            try {
              await db
                .update(manuscripts)
                .set({
                  assignedEditorName: lookup.editorName,
                  assignedEditorFetchedAt: lookup.fetchedAt,
                })
                .where(eq(manuscripts.id, manuscriptId));
            } catch {
              // Abaikan kegagalan cache update minor
            }
          }
        }

        if (!assignedEditor || assignedEditor.trim().length === 0) {
          const unassignedDetails = {
            ojsSubmissionId: manuscript.ojsSubmissionId,
            title: manuscript.title,
            authorName: manuscript.authorName || "Penulis OJS",
          };

          if (manuscriptIds.length === 1) {
            return NextResponse.json(
              {
                success: false,
                code: "OJS_EDITOR_UNASSIGNED",
                error: "Naskah belum ditugaskan ke Editor di OJS.",
                details: unassignedDetails,
              },
              { status: 422, headers: corsHeaders },
            );
          }

          results.push({
            manuscriptId,
            success: false,
            code: "OJS_EDITOR_UNASSIGNED",
            error: "Naskah belum ditugaskan ke Editor di OJS.",
            unassignedDetails,
          } as any);
          continue;
        }
      }

      // 2. Ambil versi aktif naskah
      let versionRow = null;
      if (manuscript.currentVersionId) {
        const vRows = await db
          .select()
          .from(manuscriptVersions)
          .where(eq(manuscriptVersions.id, manuscript.currentVersionId))
          .limit(1);
        if (vRows.length > 0) {
          versionRow = vRows[0];
        }
      }

      if (!versionRow) {
        const vRows = await db
          .select()
          .from(manuscriptVersions)
          .where(eq(manuscriptVersions.manuscriptId, manuscriptId))
          .orderBy(desc(manuscriptVersions.versionNumber))
          .limit(1);
        if (vRows.length > 0) {
          versionRow = vRows[0];
        }
      }

      if (!versionRow) {
        results.push({
          manuscriptId,
          success: false,
          error: "Versi naskah tidak ditemukan untuk diproses.",
        });
        continue;
      }

      // 3. Baca byte stream berkas naskah dari disk penyimpanan lokal
      let buffer: Buffer;
      try {
        buffer = await readManuscriptFile(versionRow.fileStoragePath);
      } catch (fileErr: any) {
        results.push({
          manuscriptId,
          success: false,
          error: `Gagal membaca berkas fisik: ${fileErr?.message || "File tidak ditemukan"}`,
        });
        continue;
      }

      // 4. Eksekusi Engine Penapisan Format DOCX
      let screening;
      try {
        screening = await screenManuscript(buffer);
      } catch (screenErr: any) {
        await db
          .update(manuscriptVersions)
          .set({
            parseStatus: "failed",
            parseErrorMessage: screenErr?.message || "Gagal memproses struktur berkas .docx",
          })
          .where(eq(manuscriptVersions.id, versionRow.id));

        await db
          .update(manuscripts)
          .set({
            status: "processing_failed",
            updatedAt: new Date(),
          })
          .where(eq(manuscripts.id, manuscriptId));

        results.push({
          manuscriptId,
          success: false,
          error: screenErr?.message || "Gagal memproses dokumen .docx",
        });
        continue;
      }

      // 5. Hitung Skor & Status Kelulusan
      const summary = summarize(screening.findings);
      const score =
        screening.totalRulesChecked > 0
          ? Math.round((screening.totalRulesPassed / screening.totalRulesChecked) * 100)
          : 0;
      const passed = score >= 80 && summary.errorFindings === 0;
      const nextStatus: ManuscriptStatus = passed ? "passed" : "needs_revision";

      // 6. Simpan hasil penapisan ke database secara transaksional (1 query delete cascade untuk screening_runs lama)
      await db.transaction(async (tx) => {
        await tx
          .delete(screeningRuns)
          .where(eq(screeningRuns.manuscriptVersionId, versionRow.id));

        // Simpan screeningRuns ke mqc_db
        const [newRun] = await tx
          .insert(screeningRuns)
          .values({
            manuscriptVersionId: versionRow.id,
            ruleSetVersion: "jurnal-permukiman-2026-v1",
            totalRulesChecked: screening.totalRulesChecked,
            totalRulesPassed: screening.totalRulesPassed,
            totalRulesFailed: Math.max(0, screening.totalRulesChecked - screening.totalRulesPassed),
            status: "completed",
            errorFindings: summary.errorFindings,
            warningFindings: summary.warningFindings,
            noticeFindings: 0,
          })
          .returning({ id: screeningRuns.id });

        // Simpan findings ke mqc_db dengan fallback nilai aman
        if (screening.findings.length > 0) {
          await tx.insert(findings).values(
            screening.findings.map((f) => ({
              screeningRunId: newRun.id,
              section: f.section,
              ruleId: f.ruleId,
              severity: f.severity,
              checkType: f.checkType,
              location: f.location || "",
              currentValue: f.currentValue || "",
              expectedValue: f.expectedValue || "",
              suggestedFix: f.suggestedFix || "",
              ruleName: f.ruleId,
              message: f.suggestedFix || f.expectedValue || "",
            })),
          );
        }

        // Update manuscriptVersions.parseStatus = 'success'
        await tx
          .update(manuscriptVersions)
          .set({
            parseStatus: "success",
            parseErrorMessage: null,
          })
          .where(eq(manuscriptVersions.id, versionRow.id));

        // Update manuscripts: status, counter, updatedAt
        await tx
          .update(manuscripts)
          .set({
            status: nextStatus,
            totalRulesChecked: screening.totalRulesChecked,
            totalRulesPassed: screening.totalRulesPassed,
            errorFindings: summary.errorFindings,
            warningFindings: summary.warningFindings,
            updatedAt: new Date(),
          })
          .where(eq(manuscripts.id, manuscriptId));
      });

      // 7. Resolusi "Diperiksa oleh" (Opsi B) & Sinkronisasi Laporan ke OJS (Dry-Run di Fase 1)
      try {
        const reviewedBy = await resolveReviewedByForManuscript({
          id: manuscript.id,
          ojsSubmissionId: manuscript.ojsSubmissionId,
          assignedEditorName: manuscript.assignedEditorName,
          assignedEditorFetchedAt: manuscript.assignedEditorFetchedAt,
        });

        const reportFindings: ReportFinding[] = screening.findings.map((f) => ({
          ruleId: f.ruleId,
          section: f.section as any,
          severity: f.severity as any,
          checkType: f.checkType as any,
          location: f.location || "",
          currentValue: f.currentValue || "",
          expectedValue: f.expectedValue || "",
          suggestedFix: f.suggestedFix || "",
        }));

        const reportBuffer = await generateReportDocx({
          manuscriptTitle: manuscript.title,
          originalFileName: versionRow.originalFileName,
          versionNumber: versionRow.versionNumber,
          reviewedBy,
          reviewedAt: new Date(),
          totalRulesChecked: screening.totalRulesChecked,
          totalRulesPassed: screening.totalRulesPassed,
          findings: reportFindings,
        });

        let syncModeResult: "dry_run" | "live" | "skipped" = "skipped";
        let syncPayloadData: Record<string, unknown> | null = null;
        let nextOjsFileId = manuscript.ojsReportSubmissionFileId ?? null;

        if (manuscript.ojsSubmissionId) {
          const reportFileName = buildOjsReportFileName(
            versionRow.originalFileName || manuscript.originalFileName,
          );
          const uploadResult = await uploadOrUpdateReportToOjs({
            ojsSubmissionId: manuscript.ojsSubmissionId,
            manuscriptId: manuscript.id,
            versionNumber: versionRow.versionNumber,
            reportBuffer,
            fileName: reportFileName,
            existingOjsSubmissionFileId: manuscript.ojsReportSubmissionFileId,
          });
          syncModeResult = uploadResult.mode;
          syncPayloadData = { ...uploadResult };
          if (uploadResult.submissionFileId) {
            nextOjsFileId = uploadResult.submissionFileId;
          }
        }

        const finalSyncStatus =
          syncModeResult === "live"
            ? "synced"
            : syncModeResult === "dry_run"
              ? "dry_run"
              : "idle";

        await db
          .update(manuscripts)
          .set({
            ojsReportSubmissionFileId: nextOjsFileId,
            ojsSyncStatus: finalSyncStatus,
            ojsLastSyncedAt: new Date(),
            ojsSyncError: null,
          })
          .where(eq(manuscripts.id, manuscriptId));

        const idempotencyKey = buildJobIdempotencyKey(
          manuscript.id,
          manuscript.ojsSubmissionId,
          versionRow.versionNumber,
        );

        await db
          .update(screeningJobs)
          .set({
            status: "completed",
            syncMode: syncModeResult,
            syncPayload: syncPayloadData,
            lockedBy: null,
            lockedUntil: null,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(screeningJobs.idempotencyKey, idempotencyKey));
      } catch (syncErr: any) {
        await db
          .update(manuscripts)
          .set({
            ojsSyncStatus: "failed",
            ojsSyncError: syncErr?.message || "Gagal menyinkronkan laporan ke OJS",
          })
          .where(eq(manuscripts.id, manuscriptId));
      }

      results.push({
        manuscriptId,
        success: true,
        status: nextStatus,
        score,
        passed,
        summary: {
          totalChecked: screening.totalRulesChecked,
          totalPassed: screening.totalRulesPassed,
          errorCount: summary.errorFindings,
          warningCount: summary.warningFindings,
        },
      });
    } catch (err: any) {
      console.error(`Gagal memeriksa naskah ID ${manuscriptId}:`, err);
      results.push({
        manuscriptId,
        success: false,
        error: `Kesalahan internal sistem: ${err?.message || "Unknown error"}`,
      });
    }
  }

  const processedCount = results.filter((r) => r.success).length;

  return NextResponse.json(
    {
      success: true,
      processedCount,
      results,
    },
    {
      status: 200,
      headers: corsHeaders,
    },
  );
}
