import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { screenManuscript, summarize } from "@/lib/docx/screenManuscript";
import { saveManuscriptFile } from "@/lib/storage/localStorage";
import { validateDocxFileName, validateDocxSize } from "@/lib/upload/validateFile";
import { receiveUploadedManuscript } from "@/lib/upload/receiveUpload";
import { db, manuscripts, manuscriptVersions, screeningRuns, findings, users } from "@/db";
import { eq } from "drizzle-orm";
import { ManuscriptStatus } from "@/lib/types";

const RULE_SET_VERSION = "jurnal-permukiman-2026-v1";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: manuscriptId } = await params;

  if (!UUID_REGEX.test(manuscriptId)) {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }

  // 1. Cek keberadaan naskah induk di PostgreSQL mqc_db
  const msRows = await db
    .select()
    .from(manuscripts)
    .where(eq(manuscripts.id, manuscriptId))
    .limit(1);

  if (msRows.length === 0) {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }

  const manuscript = msRows[0];

  let originalFileName = "";
  let buffer: Buffer;
  let storagePath: string;

  const contentType = request.headers.get("content-type") || "";

  // 2. Ekstraksi berkas revisi dari FormData atau legacy JSON
  if (contentType.includes("multipart/form-data")) {
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
        { error: "Berkas revisi tidak ditemukan dalam form data." },
        { status: 400 },
      );
    }

    originalFileName = (file as any).name || "revisi.docx";
    const nameError = validateDocxFileName(originalFileName);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

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

    // Simpan ke disk fisik lokal (storage/manuscripts/revisions/...)
    const saveResult = await saveManuscriptFile(buffer, originalFileName, "revisions");
    storagePath = saveResult.storagePath;
  } else {
    // Jalur mundur: Legacy JSON
    let supabaseUser: any = null;
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      supabaseUser = user;
    } catch {
      // Supabase offline
    }

    const supabase = await createClient().catch(() => null);
    const received =
      supabaseUser && supabase
        ? await receiveUploadedManuscript(request, supabase, supabaseUser.id)
        : { ok: false as const, error: "Unggahan harus menggunakan format FormData.", status: 400 };

    if (!received.ok) {
      return NextResponse.json({ error: received.error }, { status: received.status });
    }

    storagePath = received.storagePath;
    originalFileName = received.originalFileName;
    buffer = received.buffer;
  }

  // 3. Resolusi Pengguna (Opsional / Staff / Default)
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) userId = user.id;
  } catch {
    // Supabase auth offline
  }

  if (!userId) {
    const [firstUser] = await db.select({ id: users.id }).from(users).limit(1);
    if (firstUser) userId = firstUser.id;
  }

  const newVersionNumber = (manuscript.versionNumber || 1) + 1;

  // 4. Update status naskah induk menjadi "processing"
  await db
    .update(manuscripts)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(manuscripts.id, manuscriptId));

  // 5. Simpan baris versi baru di manuscript_versions
  const [version] = await db
    .insert(manuscriptVersions)
    .values({
      manuscriptId,
      versionNumber: newVersionNumber,
      originalFileName,
      fileStoragePath: storagePath,
      uploadedBy: userId,
      parseStatus: "pending",
    })
    .returning({ id: manuscriptVersions.id });

  await db
    .update(manuscripts)
    .set({
      currentVersionId: version.id,
      versionNumber: newVersionNumber,
      originalFileName,
    })
    .where(eq(manuscripts.id, manuscriptId));

  // 6. Eksekusi Engine Penapisan Format DOCX
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
      .where(eq(manuscripts.id, manuscriptId));

    return NextResponse.json(
      { error: err?.message || "Gagal memproses dokumen .docx" },
      { status: 500 },
    );
  }

  // 7. Hitung Skor & Status Kelulusan
  const summary = summarize(screening.findings);
  const score =
    screening.totalRulesChecked > 0
      ? Math.round((screening.totalRulesPassed / screening.totalRulesChecked) * 100)
      : 0;
  const passed = score >= 80 && summary.errorFindings === 0;
  const nextStatus: ManuscriptStatus = passed ? "passed" : "needs_revision";

  // 8. Simpan screeningRuns & findings secara transaksional
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
        versionNumber: newVersionNumber,
        currentVersionId: version.id,
        totalRulesChecked: screening.totalRulesChecked,
        totalRulesPassed: screening.totalRulesPassed,
        errorFindings: summary.errorFindings,
        warningFindings: summary.warningFindings,
        updatedAt: new Date(),
      })
      .where(eq(manuscripts.id, manuscriptId));
  });

  return NextResponse.json({ manuscriptId, versionId: version.id }, { status: 201 });
}
