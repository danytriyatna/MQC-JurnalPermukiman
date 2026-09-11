import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { screenManuscript, summarize } from "@/lib/docx/screenManuscript";
import { DocxParseError } from "@/lib/docx/parseDocx";
import { FindingDraft } from "@/lib/docx/types";
import { validateDocxFile } from "@/lib/upload/validateFile";
import { buildManuscriptStoragePath } from "@/lib/upload/storagePath";

const RULE_SET_VERSION = "jurnal-permukiman-2026-v1";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Anda harus login." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File tidak ditemukan." }, { status: 400 });
  }

  const validationError = validateDocxFile(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const title = file.name.replace(/\.docx$/i, "");

  // Create the manuscript row up front with status "processing" so it's
  // immediately visible on the dashboard (and reflected in the "Sedang
  // Diproses" stat) for the duration of screening, instead of only ever
  // appearing once a final status is already known.
  const { data: manuscript, error: manuscriptError } = await supabase
    .from("manuscripts")
    .insert({
      title,
      original_file_name: file.name,
      uploaded_by: user.id,
      status: "processing",
      version_number: 1,
      total_rules_checked: 0,
      total_rules_passed: 0,
      error_findings: 0,
      warning_findings: 0,
    })
    .select("id")
    .single();

  if (manuscriptError || !manuscript) {
    return NextResponse.json(
      { error: `Gagal menyimpan naskah: ${manuscriptError?.message}` },
      { status: 500 },
    );
  }

  const markFailed = async (message: string) => {
    await supabase
      .from("manuscripts")
      .update({ status: "processing_failed" })
      .eq("id", manuscript.id);
    return NextResponse.json({ error: message }, { status: 500 });
  };

  const buffer = Buffer.from(await file.arrayBuffer());

  let screening: Awaited<ReturnType<typeof screenManuscript>> | null = null;
  let parseStatus: "success" | "failed" = "success";
  let parseErrorMessage: string | null = null;

  try {
    screening = await screenManuscript(buffer);
  } catch (err) {
    parseStatus = "failed";
    parseErrorMessage =
      err instanceof DocxParseError ? err.message : "Gagal memproses isi dokumen.";
  }

  const storagePath = buildManuscriptStoragePath(user.id);
  const { error: uploadError } = await supabase.storage
    .from("manuscripts")
    .upload(storagePath, buffer, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: false,
    });

  if (uploadError) {
    return markFailed(`Gagal menyimpan file: ${uploadError.message}`);
  }

  const { data: version, error: versionError } = await supabase
    .from("manuscript_versions")
    .insert({
      manuscript_id: manuscript.id,
      version_number: 1,
      original_file_name: file.name,
      file_storage_path: storagePath,
      uploaded_by: user.id,
      parse_status: parseStatus,
      parse_error_message: parseErrorMessage,
    })
    .select("id")
    .single();

  if (versionError || !version) {
    return markFailed(`Gagal menyimpan versi naskah: ${versionError?.message}`);
  }

  if (screening) {
    const { data: run, error: runError } = await supabase
      .from("screening_runs")
      .insert({
        manuscript_version_id: version.id,
        rule_set_version: RULE_SET_VERSION,
        total_rules_checked: screening.totalRulesChecked,
        total_rules_passed: screening.totalRulesPassed,
      })
      .select("id")
      .single();

    if (!runError && run) {
      const findingRows = screening.findings.map((f: FindingDraft) => ({
        screening_run_id: run.id,
        section: f.section,
        rule_id: f.ruleId,
        severity: f.severity,
        check_type: f.checkType,
        location: f.location,
        current_value: f.currentValue,
        expected_value: f.expectedValue,
        suggested_fix: f.suggestedFix,
      }));

      if (findingRows.length > 0) {
        await supabase.from("findings").insert(findingRows);
      }
    }
  }

  const summary = screening
    ? summarize(screening.findings)
    : { errorFindings: 0, warningFindings: 0, status: "processing_failed" as const };

  await supabase
    .from("manuscripts")
    .update({
      status: parseStatus === "failed" ? "processing_failed" : summary.status,
      current_version_id: version.id,
      total_rules_checked: screening?.totalRulesChecked ?? 0,
      total_rules_passed: screening?.totalRulesPassed ?? 0,
      error_findings: summary.errorFindings,
      warning_findings: summary.warningFindings,
    })
    .eq("id", manuscript.id);

  return NextResponse.json({ manuscriptId: manuscript.id }, { status: 201 });
}
