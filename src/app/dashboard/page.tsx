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

  const manuscripts = (data as ManuscriptRow[] | null)?.map(mapManuscriptRow) ?? [];

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
        {error ? (
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
