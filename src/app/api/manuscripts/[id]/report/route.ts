import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateReportDocx, ReportFinding } from "@/lib/docx/generateReport";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
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
