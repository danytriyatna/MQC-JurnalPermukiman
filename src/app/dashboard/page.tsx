import AppHeader from "@/components/layout/AppHeader";
import ManuscriptDashboard from "@/components/dashboard/ManuscriptDashboard";
import { createClient } from "@/lib/supabase/server";
import { mapManuscriptRow, type ManuscriptRow } from "@/lib/supabase/mappers";
import { db, manuscripts as manuscriptsTable, users } from "@/db";
import { desc, isNull, eq } from "drizzle-orm";
import { Manuscript, ManuscriptStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let manuscriptsList: Manuscript[] = [];
  let dbError = false;

  // 1. Ambil naskah dari PostgreSQL lokal (mqc_db) via Drizzle ORM
  try {
    const localRows = await db
      .select({
        id: manuscriptsTable.id,
        title: manuscriptsTable.title,
        originalFileName: manuscriptsTable.originalFileName,
        status: manuscriptsTable.status,
        versionNumber: manuscriptsTable.versionNumber,
        totalRulesChecked: manuscriptsTable.totalRulesChecked,
        totalRulesPassed: manuscriptsTable.totalRulesPassed,
        errorFindings: manuscriptsTable.errorFindings,
        warningFindings: manuscriptsTable.warningFindings,
        createdAt: manuscriptsTable.createdAt,
        updatedAt: manuscriptsTable.updatedAt,
        uploaderName: users.fullName,
        authorName: manuscriptsTable.authorName,
      })
      .from(manuscriptsTable)
      .leftJoin(users, eq(users.id, manuscriptsTable.uploadedBy))
      .where(isNull(manuscriptsTable.deletedAt))
      .orderBy(desc(manuscriptsTable.updatedAt));

    manuscriptsList = localRows.map((r) => ({
      id: r.id,
      title: r.title,
      originalFileName: r.originalFileName,
      uploadedBy: r.authorName || r.uploaderName || "Penulis OJS",
      status: r.status as ManuscriptStatus,
      versionNumber: r.versionNumber,
      totalRulesChecked: r.totalRulesChecked,
      totalRulesPassed: r.totalRulesPassed,
      errorFindings: r.errorFindings,
      warningFindings: r.warningFindings,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  } catch (err) {
    console.error("Gagal mengambil naskah dari database lokal:", err);
    dbError = true;
  }

  // 2. Fallback ke Supabase HANYA jika database lokal error/tidak terhubung
  if (dbError) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("manuscripts")
        .select(
          "id, title, original_file_name, status, version_number, total_rules_checked, total_rules_passed, error_findings, warning_findings, created_at, updated_at, uploaded_by_profile:profiles!uploaded_by(full_name)",
        )
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });

      if (data) {
        manuscriptsList = (data as ManuscriptRow[]).map(mapManuscriptRow);
        dbError = false;
      }
    } catch {
      // Supabase offline/tidak dikonfigurasi
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 min-h-[calc(100vh-4rem)] pb-24">
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-slate-900">Riwayat Naskah</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Pantau status pemeriksaan kesesuaian naskah dengan template Jurnal Permukiman.
          </p>
        </div>
        {dbError && manuscriptsList.length === 0 ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Gagal memuat data naskah. Pastikan basis data lokal aktif.
          </div>
        ) : (
          <ManuscriptDashboard manuscripts={manuscriptsList} />
        )}
      </main>
    </div>
  );
}
