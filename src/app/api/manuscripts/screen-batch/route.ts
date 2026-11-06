import { NextRequest, NextResponse } from "next/server";
import { screenManuscript, summarize } from "@/lib/docx/screenManuscript";
import { readManuscriptFile } from "@/lib/storage/localStorage";
import { db, manuscripts, manuscriptVersions, screeningRuns, findings } from "@/db";
import { eq, desc } from "drizzle-orm";
import { ManuscriptStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-mqc-api-key",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: NextRequest) {
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

      // 6. Simpan hasil penapisan ke database secara transaksional
      await db.transaction(async (tx) => {
        // Bersihkan screening run lama untuk versi ini jika ada guna menghindari duplikasi
        const prevRuns = await tx
          .select({ id: screeningRuns.id })
          .from(screeningRuns)
          .where(eq(screeningRuns.manuscriptVersionId, versionRow.id));

        for (const run of prevRuns) {
          await tx.delete(findings).where(eq(findings.screeningRunId, run.id));
          await tx.delete(screeningRuns).where(eq(screeningRuns.id, run.id));
        }

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
