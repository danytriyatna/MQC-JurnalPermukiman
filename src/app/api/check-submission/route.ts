import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { saveManuscriptFile, deleteManuscriptFile } from "@/lib/storage/localStorage";
import { enqueueScreeningJob, triggerBackgroundDrain } from "@/lib/queue/screeningQueue";
import { db, manuscripts, manuscriptVersions } from "@/db";
import { eq, and, isNull, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

function getCorsHeaders(): Record<string, string> {
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN?.trim() || "http://localhost:8000";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-mqc-api-key",
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
  // 1. Validasi Shared Secret Key
  const apiKey = request.headers.get("x-mqc-api-key");
  const secret = process.env.MQC_API_SECRET;

  if (!secret || !apiKey || apiKey !== secret) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Invalid or missing API key" },
      { status: 401, headers: corsHeaders },
    );
  }

  // 2. Ekstraksi Data dari FormData
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Gagal memproses data formulir (invalid form-data)." },
      { status: 400, headers: corsHeaders },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { success: false, error: "Berkas naskah tidak ditemukan dalam form data." },
      { status: 400, headers: corsHeaders },
    );
  }

  if (file instanceof File && file.name && !file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json(
      { success: false, error: "Hanya berkas dokumen berekstensi .docx yang didukung." },
      { status: 400, headers: corsHeaders },
    );
  }

  // Ekstraksi metadata OJS pelengkap
  const rawSubId = formData.get("ojs_submission_id");
  const ojsSubmissionId =
    rawSubId !== null && rawSubId !== "" && !isNaN(Number(rawSubId)) ? Number(rawSubId) : null;

  const rawUserId = formData.get("ojs_user_id");
  const ojsUserId =
    rawUserId !== null && rawUserId !== "" && !isNaN(Number(rawUserId)) ? Number(rawUserId) : null;

  const authorName = (formData.get("author_name") as string | null)?.trim() || null;
  const authorEmail = (formData.get("author_email") as string | null)?.trim() || null;
  const customTitle = (formData.get("title") as string | null)?.trim() || null;

  // 3. Konversi ke Buffer & Validasi Sanitasi Berkas Ketat
  let buffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json(
      { success: false, error: "Gagal membaca byte stream berkas naskah." },
      { status: 500, headers: corsHeaders },
    );
  }

  // Batas ukuran berkas wajar (maksimal 50MB)
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  if (buffer.length > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        success: false,
        error: "Ukuran berkas melebihi batas maksimum yang diizinkan (50MB).",
      },
      { status: 400, headers: corsHeaders },
    );
  }

  // Magic Bytes Check: Ensure the first 4 bytes are strictly PKZip 0x50, 0x4B, 0x03, 0x04
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    buffer[2] !== 0x03 ||
    buffer[3] !== 0x04
  ) {
    return NextResponse.json(
      {
        success: false,
        error: "Format berkas tidak valid: Berkas bukan arsip PKZip (.docx) yang sah (magic bytes mismatch).",
      },
      { status: 400, headers: corsHeaders },
    );
  }

  // Deep OpenXML Structure Inspection: verify buffer is uncorrupted ZIP containing [Content_Types].xml and word/document.xml
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Berkas .docx rusak atau tidak dapat dibuka sebagai arsip ZIP yang sah.",
      },
      { status: 400, headers: corsHeaders },
    );
  }

  const contentTypesFile = zip.file("[Content_Types].xml");
  const documentXmlFile = zip.file("word/document.xml");
  if (!contentTypesFile || !documentXmlFile) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Struktur berkas .docx tidak lengkap ([Content_Types].xml atau word/document.xml hilang).",
      },
      { status: 400, headers: corsHeaders },
    );
  }

  // Pastikan word/document.xml tidak kosong tanpa mendekompresi ulang string XML multi-MB jika ukuran di header ZIP sudah > 64 byte
  try {
    const uncompressedSize = (documentXmlFile as any)?._data?.uncompressedSize;
    if (typeof uncompressedSize === "number" && uncompressedSize === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Struktur word/document.xml kosong atau tidak dapat diuraikan.",
        },
        { status: 400, headers: corsHeaders },
      );
    }
    if (typeof uncompressedSize !== "number" || uncompressedSize <= 64) {
      const docXmlContent = await documentXmlFile.async("text");
      if (!docXmlContent || docXmlContent.trim().length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Struktur word/document.xml kosong atau tidak dapat diuraikan.",
          },
          { status: 400, headers: corsHeaders },
        );
      }
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Gagal membaca isi word/document.xml dari berkas naskah.",
      },
      { status: 400, headers: corsHeaders },
    );
  }

  const originalFileName = file instanceof File && file.name ? file.name : "naskah.docx";
  const title = customTitle || originalFileName.replace(/\.docx$/i, "");

  // 4. Simpan Berkas Fisik ke Media Penyimpanan Lokal
  let storagePath: string;
  try {
    const subfolder = ojsSubmissionId ? `sub_${ojsSubmissionId}` : undefined;
    const saveResult = await saveManuscriptFile(buffer, originalFileName, subfolder);
    storagePath = saveResult.storagePath;
  } catch (err) {
    console.error("Gagal menyimpan berkas ke disk lokal:", err);
    return NextResponse.json(
      { success: false, error: "Gagal menyimpan berkas naskah ke disk lokal server." },
      { status: 500, headers: corsHeaders },
    );
  }

  // 5. Catat / Mutakhirkan Naskah dalam Antrean Tugas Pemeriksaan (Status: pending)
  let manuscriptId: string = "";
  let manuscriptVersionId: string = "";
  let versionNumber = 1;

  try {
    await db.transaction(async (tx) => {
      let existingManuscript = null;
      if (ojsSubmissionId) {
        const rows = await tx
          .select()
          .from(manuscripts)
          .where(
            and(
              eq(manuscripts.ojsSubmissionId, ojsSubmissionId),
              isNull(manuscripts.deletedAt),
            ),
          )
          .orderBy(desc(manuscripts.createdAt))
          .limit(1);
        if (rows.length > 0) {
          existingManuscript = rows[0];
        }
      }

      if (existingManuscript) {
        manuscriptId = existingManuscript.id;

        // Ambil versi maksimum yang ada agar nomor versi selalu naik secara aman
        const latestVersionRow = await tx
          .select({ maxVer: manuscriptVersions.versionNumber })
          .from(manuscriptVersions)
          .where(eq(manuscriptVersions.manuscriptId, manuscriptId))
          .orderBy(desc(manuscriptVersions.versionNumber))
          .limit(1);

        const currentMax = latestVersionRow[0]?.maxVer ?? existingManuscript.versionNumber ?? 0;
        versionNumber = Math.max(currentMax, existingManuscript.versionNumber) + 1;

        // a. Tambahkan versi baru dengan parseStatus: 'pending'
        const [newVersion] = await tx
          .insert(manuscriptVersions)
          .values({
            manuscriptId,
            versionNumber,
            originalFileName,
            fileStoragePath: storagePath,
            parseStatus: "pending",
          })
          .returning({ id: manuscriptVersions.id });

        manuscriptVersionId = newVersion.id;

        // b. Mutakhirkan data naskah induk: status pending, reset counter
        await tx
          .update(manuscripts)
          .set({
            title: customTitle || existingManuscript.title,
            status: "pending",
            versionNumber,
            currentVersionId: newVersion.id,
            totalRulesChecked: 0,
            totalRulesPassed: 0,
            errorFindings: 0,
            warningFindings: 0,
            authorName: authorName || existingManuscript.authorName,
            authorEmail: authorEmail || existingManuscript.authorEmail,
            ojsUserId: ojsUserId || existingManuscript.ojsUserId,
            updatedAt: new Date(),
          })
          .where(eq(manuscripts.id, manuscriptId));
      } else {
        // a. Buat entri naskah baru dalam antrean
        const [newManuscript] = await tx
          .insert(manuscripts)
          .values({
            title,
            originalFileName,
            status: "pending",
            versionNumber: 1,
            totalRulesChecked: 0,
            totalRulesPassed: 0,
            errorFindings: 0,
            warningFindings: 0,
            ojsSubmissionId,
            ojsUserId,
            authorName,
            authorEmail,
          })
          .returning({ id: manuscripts.id });

        manuscriptId = newManuscript.id;

        // b. Buat versi 1 dalam antrean
        const [newVersion] = await tx
          .insert(manuscriptVersions)
          .values({
            manuscriptId,
            versionNumber: 1,
            originalFileName,
            fileStoragePath: storagePath,
            parseStatus: "pending",
          })
          .returning({ id: manuscriptVersions.id });

        manuscriptVersionId = newVersion.id;

        // c. Tautkan currentVersionId
        await tx
          .update(manuscripts)
          .set({ currentVersionId: newVersion.id })
          .where(eq(manuscripts.id, manuscriptId));
      }
    });
  } catch (err) {
    console.error("Gagal mencatat naskah ke database:", err);
    // Hapus file fisik di disk jika pencatatan database gagal demi menghindari orphaned files
    try {
      await deleteManuscriptFile(storagePath);
    } catch {
      // Abaikan error cleanup
    }
    return NextResponse.json(
      { success: false, error: "Gagal mencatat metadata naskah ke basis data." },
      { status: 500, headers: corsHeaders },
    );
  }

  // 6. Daftarkan Job ke Antrean PostgreSQL (screening_jobs) secara Idempoten
  let jobId: string | null = null;
  try {
    const queued = await enqueueScreeningJob({
      manuscriptId,
      manuscriptVersionId,
      ojsSubmissionId,
      versionNumber,
    });
    jobId = queued.jobId;

    // Trigger pemrosesan antrean secara asinkron (non-blocking) dengan Single-Flight Coalescing Lock.
    // Meski 50 request masuk serentak, hanya 1 pool worker yang berjalan tanpa memicu thundering herd.
    if (process.env.AUTO_DRAIN_ON_INGEST !== "false") {
      setTimeout(() => {
        void triggerBackgroundDrain({ concurrency: 4 });
      }, 5);
    }
  } catch (queueErr) {
    console.error("Gagal mendaftarkan job ke screening_jobs:", queueErr);
  }

  // 7. Kembalikan Respons Cepat (< 100ms) tanpa token/viewUrl yang tak terpakai
  return NextResponse.json(
    {
      success: true,
      status: "pending",
      message: "Naskah berhasil diterima dan terdaftar di antrean pemeriksaan redaksi.",
      manuscriptId,
      versionNumber,
      jobId,
    },
    {
      status: 200,
      headers: corsHeaders,
    },
  );
}
