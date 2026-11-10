import fs from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateReportDocx, ReportFinding } from "@/lib/docx/generateReport";
import { screenManuscript } from "@/lib/docx/screenManuscript";
import { findOjsSubmission } from "@/lib/ojs/localStore";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (id.startsWith("ojs-")) {
    const ojsItem = await findOjsSubmission(id);
    if (!ojsItem) {
      return NextResponse.json({ error: "Naskah OJS tidak ditemukan." }, { status: 404 });
    }

    let findings: ReportFinding[] = [];
    let totalRulesChecked = ojsItem.totalRulesChecked ?? 25;
    let totalRulesPassed = ojsItem.totalRulesPassed ?? 0;

    if (ojsItem.filePath) {
      try {
        const docBuf = await fs.readFile(ojsItem.filePath);
        const screening = await screenManuscript(docBuf);
        totalRulesChecked = screening.totalRulesChecked;
        totalRulesPassed = screening.totalRulesPassed;
        findings = screening.findings.map((f) => ({
          ruleId: f.ruleId,
          section: f.section,
          severity: f.severity,
          checkType: f.checkType,
          location: f.location ?? "Dokumen Utama",
          currentValue: f.currentValue ?? "-",
          expectedValue: f.expectedValue ?? "-",
          suggestedFix: f.suggestedFix ?? "Sesuaikan dengan template Jurnal Permukiman",
        }));
      } catch {
        // Keep stored summary if file cannot be re-parsed on demand
      }
    }

    const buffer = await generateReportDocx({
      manuscriptTitle: ojsItem.title,
      originalFileName: ojsItem.originalFileName,
      versionNumber: ojsItem.versionNumber ?? 1,
      reviewedBy: ojsItem.uploadedBy,
      reviewedAt: new Date(ojsItem.updatedAt),
      totalRulesChecked,
      totalRulesPassed,
      findings,
    });

    const safeName = ojsItem.title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "laporan";
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Laporan - ${safeName}.docx"`,
      },
    });
  }

  if (process.env.NEXT_PUBLIC_DEV_MODE === "true" && id.startsWith("demo-")) {
    const isPassed = id === "demo-mqc-1";
    const title = isPassed
      ? "Kajian Kuat Lentur Balok Beton Bertulang dengan Agregat Daur Ulang"
      : "Analisis Pola Sebaran dan Kepadatan Permukiman Kumuh Pesisir Semarang";
    const findings: ReportFinding[] = isPassed
      ? [
          {
            ruleId: "ref-doi",
            section: "references_citation",
            severity: "warning",
            checkType: "manual_review_suggested",
            location: "Daftar Pustaka [12]",
            currentValue: "Sitasi artikel prosiding tanpa mencantumkan tautan DOI",
            expectedValue: "Disarankan mencantumkan DOI aktif bila tersedia",
            suggestedFix: "Periksa kembali DOI di Crossref atau repositori penerbit",
          },
        ]
      : [
          {
            ruleId: "abs-words",
            section: "abstract",
            severity: "error",
            checkType: "automated",
            location: "Abstrak Bahasa Inggris",
            currentValue: "Jumlah kata: 285 kata",
            expectedValue: "Maksimal 200–250 kata sesuai template 2026",
            suggestedFix: "Ringkas bagian latar belakang dan metodologi agar di bawah 250 kata",
          },
          {
            ruleId: "fig-caption",
            section: "tables_figures_equations",
            severity: "error",
            checkType: "automated",
            location: "Gambar 2 (Peta Sebaran)",
            currentValue: "Judul gambar diletakkan di atas gambar",
            expectedValue: "Judul gambar wajib diletakkan di bawah gambar dengan format Gambar 1. Judul",
            suggestedFix: "Pindahkan caption gambar ke bagian bawah objek",
          },
        ];

    const buffer = await generateReportDocx({
      manuscriptTitle: title,
      originalFileName: isPassed
        ? "Kajian_Kuat_Lentur_Balok_2026.docx"
        : "Pola_Sebaran_Permukiman_Pesisir.docx",
      versionNumber: isPassed ? 1 : 2,
      reviewedBy: "Dany Triyatna",
      reviewedAt: new Date("2026-11-10T07:26:00.000Z"),
      totalRulesChecked: 25,
      totalRulesPassed: isPassed ? 24 : 19,
      findings,
    });

    const safeName = title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "laporan";
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Laporan - ${safeName}.docx"`,
      },
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Anda harus login." }, { status: 401 });
  }

  const { data: manuscript, error: manuscriptError } = await supabase
    .from("manuscripts")
    .select(
      "id, title, original_file_name, version_number, total_rules_checked, total_rules_passed, current_version_id, updated_at, uploaded_by_profile:profiles!uploaded_by(full_name)",
    )
    .eq("id", id)
    .single();

  if (manuscriptError || !manuscript) {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }

  if (!manuscript.current_version_id) {
    return NextResponse.json(
      { error: "Naskah belum memiliki hasil pemeriksaan." },
      { status: 400 },
    );
  }

  const { data: run } = await supabase
    .from("screening_runs")
    .select("id")
    .eq("manuscript_version_id", manuscript.current_version_id)
    .order("run_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let findings: ReportFinding[] = [];

  if (run) {
    const { data: findingRows } = await supabase
      .from("findings")
      .select("rule_id, section, severity, check_type, location, current_value, expected_value, suggested_fix")
      .eq("screening_run_id", run.id);

    findings = (findingRows ?? []).map((f) => ({
      ruleId: f.rule_id,
      section: f.section,
      severity: f.severity,
      checkType: f.check_type,
      location: f.location,
      currentValue: f.current_value,
      expectedValue: f.expected_value,
      suggestedFix: f.suggested_fix,
    }));
  }

  const uploadedByProfile = Array.isArray(manuscript.uploaded_by_profile)
    ? manuscript.uploaded_by_profile[0]
    : manuscript.uploaded_by_profile;

  let buffer: Buffer;
  try {
    buffer = await generateReportDocx({
      manuscriptTitle: manuscript.title,
      originalFileName: manuscript.original_file_name,
      versionNumber: manuscript.version_number,
      reviewedBy: uploadedByProfile?.full_name ?? "—",
      reviewedAt: new Date(manuscript.updated_at),
      totalRulesChecked: manuscript.total_rules_checked,
      totalRulesPassed: manuscript.total_rules_passed,
      findings,
    });
  } catch {
    return NextResponse.json({ error: "Gagal membuat laporan." }, { status: 500 });
  }

  const safeName = manuscript.title.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "laporan";

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="Laporan - ${safeName}.docx"`,
    },
  });
}
