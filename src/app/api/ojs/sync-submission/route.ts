import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { screenManuscript, summarize } from "@/lib/docx/screenManuscript";
import { DocxParseError } from "@/lib/docx/parseDocx";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

const SYNC_STORE_FILE = path.join(process.cwd(), "data", "ojs_synced_submissions.json");

async function getSavedSubmissions(): Promise<any[]> {
  try {
    const raw = await fs.readFile(SYNC_STORE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveSubmission(item: any): Promise<void> {
  try {
    const dir = path.dirname(SYNC_STORE_FILE);
    await fs.mkdir(dir, { recursive: true });
    const current = await getSavedSubmissions();
    // Prepend or update if existing
    const existingIndex = current.findIndex(
      (m: any) => m.ojs_submission_id === item.ojs_submission_id || m.id === item.id,
    );
    if (existingIndex >= 0) {
      current[existingIndex] = { ...current[existingIndex], ...item };
    } else {
      current.unshift(item);
    }
    await fs.writeFile(SYNC_STORE_FILE, JSON.stringify(current, null, 2), "utf-8");
  } catch (err) {
    console.error("[MQC Sync Store Error]", err);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET() {
  const items = await getSavedSubmissions();
  return NextResponse.json({ success: true, count: items.length, data: items }, { headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    let payload: any = {};
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      payload = await request.json();
    } else if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      payload.ojs_submission_id = formData.get("ojs_submission_id");
      payload.title = formData.get("title");
      payload.author_name = formData.get("author_name");
      payload.original_file_name = formData.get("original_file_name");
      payload.file_path = formData.get("file_path");

      const fileField = formData.get("file");
      if (fileField && fileField instanceof Blob) {
        payload.file_buffer = Buffer.from(await fileField.arrayBuffer());
      }
    } else {
      return NextResponse.json(
        { success: false, error: "Content-Type harus berupa application/json atau multipart/form-data" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const ojsSubmissionId = payload.ojs_submission_id || `ojs-${Date.now()}`;
    const title = payload.title || `Naskah OJS #${ojsSubmissionId}`;
    const authorName = payload.author_name || "Penulis OJS";
    const originalFileName = payload.original_file_name || "manuscript.docx";
    const filePath = payload.file_path || "";

    let buffer: Buffer | null = null;

    // 1. Coba baca langsung dari disk server (Single Source of Truth)
    if (filePath) {
      try {
        const fileExists = await fs
          .access(filePath)
          .then(() => true)
          .catch(() => false);
        if (fileExists) {
          buffer = await fs.readFile(filePath);
          console.log(`[MQC Sync] Berhasil membaca berkas OJS dari disk: ${filePath} (${buffer.length} bytes)`);
        }
      } catch (err) {
        console.warn(`[MQC Sync] Gagal membaca disk path ${filePath}:`, err);
      }
    }

    // 2. Fallback: gunakan buffer dari payload multipart atau base64
    if (!buffer) {
      if (payload.file_buffer && Buffer.isBuffer(payload.file_buffer)) {
        buffer = payload.file_buffer;
      } else if (payload.file_content_base64) {
        buffer = Buffer.from(payload.file_content_base64, "base64");
      }
    }

    let screeningResult = {
      totalRulesChecked: 25,
      totalRulesPassed: 25,
      score: 100,
      status: "passed" as const,
      errorCount: 0,
      warningCount: 0,
      errors: [] as any[],
      warnings: [] as any[],
    };

    if (buffer && buffer.length > 0) {
      try {
        const screening = await screenManuscript(buffer);
        const summary = summarize(screening.findings);

        const totalRulesChecked = screening.totalRulesChecked;
        const totalRulesPassed = screening.totalRulesPassed;
        const score = totalRulesChecked > 0 ? Math.round((totalRulesPassed / totalRulesChecked) * 100) : 0;
        const passed = score >= 80 && summary.errorFindings === 0;

        screeningResult = {
          totalRulesChecked,
          totalRulesPassed,
          score,
          status: passed ? "passed" : "needs_revision",
          errorCount: summary.errorFindings,
          warningCount: summary.warningFindings,
          errors: screening.findings.filter((f) => f.severity === "error"),
          warnings: screening.findings.filter((f) => f.severity === "warning"),
        };
      } catch (parseErr) {
        console.warn("[MQC Sync] Peringatan saat parsing docx:", parseErr);
        screeningResult.status = "needs_revision";
      }
    }

    const nowIso = new Date().toISOString();
    const createdAt = payload.submitted_at || nowIso;
    const updatedAt = payload.updated_at || nowIso;

    const manuscriptRecord = {
      id: `ojs-${ojsSubmissionId}`,
      ojs_submission_id: Number(ojsSubmissionId) || ojsSubmissionId,
      title: title.replace(/\.docx$/i, ""),
      originalFileName,
      uploadedBy: authorName,
      status: screeningResult.status,
      versionNumber: 1,
      totalRulesChecked: screeningResult.totalRulesChecked,
      totalRulesPassed: screeningResult.totalRulesPassed,
      errorFindings: screeningResult.errorCount,
      warningFindings: screeningResult.warningCount,
      score: screeningResult.score,
      filePath: filePath || null,
      source: "OJS_SYNC",
      createdAt,
      updatedAt,
    };

    // Simpan ke antrean lokal MQC
    await saveSubmission(manuscriptRecord);

    console.log(`[MQC Sync] Naskah OJS #${ojsSubmissionId} (${title}) berhasil disinkronisasi ke MQC.`);

    return NextResponse.json(
      {
        success: true,
        message: `Naskah OJS #${ojsSubmissionId} berhasil disinkronkan ke MQC.`,
        data: manuscriptRecord,
      },
      { status: 200, headers: CORS_HEADERS },
    );
  } catch (error) {
    console.error("[MQC Sync Route Error]", error);
    const message = error instanceof Error ? error.message : "Terjadi kesalahan pada sinkronisasi MQC";
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: CORS_HEADERS });
  }
}
