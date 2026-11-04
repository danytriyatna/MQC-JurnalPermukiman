import { NextRequest, NextResponse } from "next/server";
import { screenManuscript, summarize } from "@/lib/docx/screenManuscript";
import { DocxParseError } from "@/lib/docx/parseDocx";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { success: false, error: "Request harus berupa multipart/form-data" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: "Berkas naskah (.docx) wajib diunggah pada field 'file'" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const filename = (file as { name?: string }).name || "manuscript.docx";
    if (!filename.toLowerCase().endsWith(".docx")) {
      return NextResponse.json(
        { success: false, error: "Berkas harus berformat Microsoft Word (.docx)" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length === 0) {
      return NextResponse.json(
        { success: false, error: "Berkas naskah kosong (0 byte)" },
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Eksekusi mesin audit format MQC
    const screening = await screenManuscript(buffer);
    const summary = summarize(screening.findings);

    const totalRulesChecked = screening.totalRulesChecked;
    const totalRulesPassed = screening.totalRulesPassed;
    const score = totalRulesChecked > 0 ? Math.round((totalRulesPassed / totalRulesChecked) * 100) : 0;

    // Ambang batas lolos: Skor minimal 80 dan tidak ada error fatal (hanya toleransi warning)
    const passed = score >= 80 && summary.errorFindings === 0;

    const errors = screening.findings
      .filter((f) => f.severity === "error")
      .map((f) => ({
        section: f.section,
        ruleId: f.ruleId,
        location: f.location,
        currentValue: f.currentValue,
        expectedValue: f.expectedValue,
        suggestedFix: f.suggestedFix,
      }));

    const warnings = screening.findings
      .filter((f) => f.severity === "warning")
      .map((f) => ({
        section: f.section,
        ruleId: f.ruleId,
        location: f.location,
        currentValue: f.currentValue,
        expectedValue: f.expectedValue,
        suggestedFix: f.suggestedFix,
      }));

    return NextResponse.json(
      {
        success: true,
        filename,
        passed,
        score,
        status: passed ? "passed" : "needs_revision",
        summary: {
          totalRulesChecked,
          totalRulesPassed,
          errorCount: summary.errorFindings,
          warningCount: summary.warningFindings,
        },
        errors,
        warnings,
        message: passed
          ? `Naskah memenuhi standar format Jurnal Permukiman (Skor: ${score}/100).`
          : `Naskah belum memenuhi standar format (Skor: ${score}/100, ${summary.errorFindings} pelanggaran kritis). Silakan perbaiki sebelum melanjutkan.`,
      },
      {
        status: 200,
        headers: CORS_HEADERS,
      },
    );
  } catch (error) {
    const message =
      error instanceof DocxParseError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Terjadi kesalahan internal saat memproses berkas DOCX";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 500,
        headers: CORS_HEADERS,
      },
    );
  }
}
