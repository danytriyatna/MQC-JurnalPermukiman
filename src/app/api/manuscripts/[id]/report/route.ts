import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateReportDocx, ReportFinding } from "@/lib/docx/generateReport";
import { verifyInspectionToken } from "@/lib/auth/token";
import { resolveReviewedByForManuscript, buildOjsReportFileName } from "@/lib/ojs/ojsClient";
import { db, manuscripts as manuscriptsTable, screeningRuns, findings as findingsTable, users } from "@/db";
import { eq, desc } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // 1. Verifikasi Otorisasi: Signed Token ATAU Sesi Pengguna
  const token = request.nextUrl.searchParams.get("token");
  let isAuthorized = false;

  if (token) {
    const verified = await verifyInspectionToken(token, id);
    if (verified) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        isAuthorized = true;
      }
    } catch {
      // Abaikan jika Supabase offline
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "Unauthorized: Anda harus login atau menyertakan token inspeksi yang sah." },
      { status: 401 },
    );
  }

  // 2. Coba ambil naskah dari basis data lokal PostgreSQL (mqc_db)
  let manuscriptData: any = null;
  let findings: ReportFinding[] = [];

  try {
    const rows = await db
      .select({
        id: manuscriptsTable.id,
        title: manuscriptsTable.title,
        original_file_name: manuscriptsTable.originalFileName,
        version_number: manuscriptsTable.versionNumber,
        total_rules_checked: manuscriptsTable.totalRulesChecked,
        total_rules_passed: manuscriptsTable.totalRulesPassed,
        current_version_id: manuscriptsTable.currentVersionId,
        updated_at: manuscriptsTable.updatedAt,
        author_name: manuscriptsTable.authorName,
        ojs_submission_id: manuscriptsTable.ojsSubmissionId,
        assigned_editor_name: manuscriptsTable.assignedEditorName,
        assigned_editor_fetched_at: manuscriptsTable.assignedEditorFetchedAt,
        uploader_name: users.fullName,
      })
      .from(manuscriptsTable)
      .leftJoin(users, eq(users.id, manuscriptsTable.uploadedBy))
      .where(eq(manuscriptsTable.id, id))
      .limit(1);

    if (rows.length > 0) {
      manuscriptData = rows[0];

      if (manuscriptData.current_version_id) {
        const runRows = await db
          .select()
          .from(screeningRuns)
          .where(eq(screeningRuns.manuscriptVersionId, manuscriptData.current_version_id))
          .orderBy(desc(screeningRuns.runAt))
          .limit(1);

        if (runRows.length > 0) {
          const run = runRows[0];
          const findingRows = await db
            .select()
            .from(findingsTable)
            .where(eq(findingsTable.screeningRunId, run.id));

          findings = findingRows.map((f) => ({
            ruleId: f.ruleId,
            section: f.section as any,
            severity: f.severity as any,
            checkType: f.checkType as any,
            location: f.location,
            currentValue: f.currentValue,
            expectedValue: f.expectedValue,
            suggestedFix: f.suggestedFix,
          }));
        }
      }
    }
  } catch (err) {
    console.error("Gagal membaca naskah dari Drizzle untuk report:", err);
  }

  // 3. Fallback ke Supabase jika naskah tidak ada di lokal
  if (!manuscriptData) {
    try {
      const supabase = await createClient();
      const { data: manuscript, error: manuscriptError } = await supabase
        .from("manuscripts")
        .select(
          "id, title, original_file_name, version_number, total_rules_checked, total_rules_passed, current_version_id, updated_at, uploaded_by_profile:profiles!uploaded_by(full_name)",
        )
        .eq("id", id)
        .single();

      if (!manuscriptError && manuscript) {
        const uploadedByProfile = Array.isArray(manuscript.uploaded_by_profile)
          ? manuscript.uploaded_by_profile[0]
          : manuscript.uploaded_by_profile;

        manuscriptData = {
          ...manuscript,
          author_name: uploadedByProfile?.full_name,
        };

        if (manuscript.current_version_id) {
          const { data: run } = await supabase
            .from("screening_runs")
            .select("id")
            .eq("manuscript_version_id", manuscript.current_version_id)
            .order("run_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (run) {
            const { data: findingRows } = await supabase
              .from("findings")
              .select(
                "rule_id, section, severity, check_type, location, current_value, expected_value, suggested_fix",
              )
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
        }
      }
    } catch {
      // Supabase offline
    }
  }

  if (!manuscriptData) {
    return NextResponse.json({ error: "Naskah tidak ditemukan." }, { status: 404 });
  }

  const reviewedBy = await resolveReviewedByForManuscript({
    id: manuscriptData.id,
    ojsSubmissionId: manuscriptData.ojs_submission_id,
    assignedEditorName: manuscriptData.assigned_editor_name,
    assignedEditorFetchedAt: manuscriptData.assigned_editor_fetched_at,
  });

  let buffer: Buffer;
  try {
    buffer = await generateReportDocx({
      manuscriptTitle: manuscriptData.title,
      originalFileName: manuscriptData.original_file_name,
      versionNumber: manuscriptData.version_number,
      reviewedBy,
      reviewedAt: new Date(manuscriptData.updated_at),
      totalRulesChecked: manuscriptData.total_rules_checked,
      totalRulesPassed: manuscriptData.total_rules_passed,
      findings,
    });
  } catch {
    return NextResponse.json({ error: "Gagal membuat laporan dokumen Word." }, { status: 500 });
  }

  const downloadFileName = buildOjsReportFileName(manuscriptData.original_file_name);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${downloadFileName}"`,
    },
  });
}
