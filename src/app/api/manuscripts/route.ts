import { NextRequest, NextResponse } from "next/server";
import { screenManuscript, summarize } from "@/lib/docx/screenManuscript";
import { saveManuscriptFile } from "@/lib/storage/localStorage";
import { validateDocxFileName, validateDocxSize } from "@/lib/upload/validateFile";
import { requireStaffSession } from "@/lib/auth/guard";
import { db, manuscripts, manuscriptVersions, screeningRuns, findings } from "@/db";
import { eq } from "drizzle-orm";
import { ManuscriptStatus } from "@/lib/types";

const RULE_SET_VERSION = "jurnal-permukiman-2026-v1";

export async function POST(request: NextRequest) {
  const authResult = await requireStaffSession(request);
  if (authResult.errorResponse) {
    return authResult.errorResponse;
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Unggahan harus menggunakan format multipart/form-data." },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Gagal memproses data formulir (invalid form-data)." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { error: "Berkas naskah tidak ditemukan dalam form data." },
      { status: 400 },
    );
  }

  const originalFileName = (file as any).name || "naskah.docx";
  const nameError = validateDocxFileName(originalFileName);
  if (nameError) {
    return NextResponse.json({ error: nameError }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json(
      { error: "Gagal membaca byte stream berkas naskah." },
      { status: 500 },
    );
  }

  const sizeError = validateDocxSize(buffer.length);
  if (sizeError) {
    return NextResponse.json({ error: sizeError }, { status: 400 });
  }

  // Simpan ke disk fisik lokal (storage/manuscripts/submissions/...)
  const saveResult = await saveManuscriptFile(buffer, originalFileName, "submissions");
  const storagePath = saveResult.storagePath;
  const userId = authResult.session.userId;

  const title = originalFileName.replace(/\.docx$/i, "");

  // 3. Simpan naskah induk ke PostgreSQL mqc_db via Drizzle ORM
  const [manuscript] = await db
    .insert(manuscripts)
    .values({
      title,
      originalFileName,
      uploadedBy: userId,
      status: "processing",
      versionNumber: 1,
      totalRulesChecked: 0,
      totalRulesPassed: 0,
      errorFindings: 0,
      warningFindings: 0,
    })
    .returning({ id: manuscripts.id });

  // 4. Simpan versi naskah pertama (manuscript_versions)
  const [version] = await db
    .insert(manuscriptVersions)
    .values({
      manuscriptId: manuscript.id,
      versionNumber: 1,
      originalFileName,
      fileStoragePath: storagePath,
      uploadedBy: userId,
      parseStatus: "pending",
    })
    .returning({ id: manuscriptVersions.id });

  await db
    .update(manuscripts)
    .set({ currentVersionId: version.id })
    .where(eq(manuscripts.id, manuscript.id));

  // 5. Eksekusi Engine Penapisan Format DOCX
  let screening;
  try {
    screening = await screenManuscript(buffer);
  } catch (err: any) {
    await db
      .update(manuscriptVersions)
      .set({
        parseStatus: "failed",
        parseErrorMessage: err?.message || "Gagal memproses dokumen .docx",
      })
      .where(eq(manuscriptVersions.id, version.id));

    await db
      .update(manuscripts)
      .set({
        status: "processing_failed",
        updatedAt: new Date(),
      })
      .where(eq(manuscripts.id, manuscript.id));

    return NextResponse.json(
      { manuscriptId: manuscript.id, error: err?.message || "Gagal memproses dokumen .docx" },
      { status: 500 },
    );
  }

  // 6. Hitung Skor & Status Kelulusan
  const summary = summarize(screening.findings);
  const score =
    screening.totalRulesChecked > 0
      ? Math.round((screening.totalRulesPassed / screening.totalRulesChecked) * 100)
      : 0;
  const passed = score >= 80 && summary.errorFindings === 0;
  const nextStatus: ManuscriptStatus = passed ? "passed" : "needs_revision";

  // 7. Simpan hasil penapisan (screeningRuns & findings) ke basis data mqc_db
  await db.transaction(async (tx) => {
    const [newRun] = await tx
      .insert(screeningRuns)
      .values({
        manuscriptVersionId: version.id,
        ruleSetVersion: RULE_SET_VERSION,
        totalRulesChecked: screening.totalRulesChecked,
        totalRulesPassed: screening.totalRulesPassed,
        totalRulesFailed: Math.max(0, screening.totalRulesChecked - screening.totalRulesPassed),
        status: "completed",
        errorFindings: summary.errorFindings,
        warningFindings: summary.warningFindings,
        noticeFindings: 0,
      })
      .returning({ id: screeningRuns.id });

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

    await tx
      .update(manuscriptVersions)
      .set({
        parseStatus: "success",
        parseErrorMessage: null,
      })
      .where(eq(manuscriptVersions.id, version.id));

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
      .where(eq(manuscripts.id, manuscript.id));
  });

  return NextResponse.json({ manuscriptId: manuscript.id }, { status: 201 });
}
