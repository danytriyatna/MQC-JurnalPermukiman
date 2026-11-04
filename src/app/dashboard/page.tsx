import AppHeader from "@/components/layout/AppHeader";
import ManuscriptDashboard from "@/components/dashboard/ManuscriptDashboard";
import { createClient } from "@/lib/supabase/server";
import { mapManuscriptRow, type ManuscriptRow } from "@/lib/supabase/mappers";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("manuscripts")
    .select(
      "id, title, original_file_name, status, version_number, total_rules_checked, total_rules_passed, error_findings, warning_findings, created_at, updated_at, uploaded_by_profile:profiles!uploaded_by(full_name)",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  let manuscripts = (data as ManuscriptRow[] | null)?.map(mapManuscriptRow) ?? [];

  if (process.env.NEXT_PUBLIC_DEV_MODE === "true" && (!data || data.length === 0 || error)) {
    manuscripts = [
      {
        id: "demo-mqc-1",
        title: "Kajian Kuat Lentur Balok Beton Bertulang dengan Agregat Daur Ulang",
        originalFileName: "Kajian_Kuat_Lentur_Balok_2026.docx",
        uploadedBy: "Dany Triyatna",
        status: "passed",
        versionNumber: 1,
        totalRulesChecked: 25,
        totalRulesPassed: 24,
        errorFindings: 0,
        warningFindings: 1,
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        updatedAt: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: "demo-mqc-2",
        title: "Analisis Pola Sebaran dan Kepadatan Permukiman Kumuh Pesisir Semarang",
        originalFileName: "Pola_Sebaran_Permukiman_Pesisir.docx",
        uploadedBy: "Dany Triyatna",
        status: "needs_revision",
        versionNumber: 2,
        totalRulesChecked: 25,
        totalRulesPassed: 19,
        errorFindings: 2,
        warningFindings: 4,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 43200000).toISOString(),
      },
    ];
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-lg font-semibold text-slate-900">Riwayat Naskah</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Pantau status pemeriksaan kesesuaian naskah dengan template Jurnal Permukiman.
          </p>
        </div>
        {error && process.env.NEXT_PUBLIC_DEV_MODE !== "true" ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Gagal memuat data naskah. Coba muat ulang halaman.
          </div>
        ) : (
          <ManuscriptDashboard manuscripts={manuscripts} />
        )}
      </main>
    </div>
  );
}
