import Link from "next/link";
import AppHeader from "@/components/layout/AppHeader";
import ManuscriptDashboard from "@/components/dashboard/ManuscriptDashboard";
import { createClient } from "@/lib/supabase/server";
import { mapManuscriptRow, type ManuscriptRow } from "@/lib/supabase/mappers";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getOjsSyncedSubmissions() {
  try {
    const filePath = path.join(process.cwd(), "data", "ojs_synced_submissions.json");
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

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

  // Gabungkan naskah yang disinkronkan secara otomatis dari OJS ke daftar paling atas
  const ojsSubmissions = await getOjsSyncedSubmissions();
  if (ojsSubmissions.length > 0) {
    const ojsIds = new Set(ojsSubmissions.map((s: any) => s.id));
    const remaining = manuscripts.filter((m) => !ojsIds.has(m.id));
    manuscripts = [...ojsSubmissions, ...remaining];
  }

  return (
    <div className="flex min-h-screen flex-col puskim-canvas">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1760px] flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div className="flex items-start gap-3">
            <span
              className="mt-1 h-7 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[#D14715] to-[#8C2806]"
              aria-hidden="true"
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-stone-900">
                Antrean &amp; Riwayat Naskah
              </h1>
              <p className="mt-0.5 text-sm text-stone-600">
                Daftar naskah masuk terpadu dari portal{" "}
                <strong className="font-semibold text-stone-800">OJS Jurnal Permukiman</strong>{" "}
                dan riwayat pemeriksaan format mandiri.
              </p>
            </div>
          </div>
          {ojsSubmissions.length > 0 && (
            <span className="inline-flex items-center gap-2 self-start sm:self-auto rounded-full border border-emerald-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-100" aria-hidden="true" />
              Terhubung ke OJS ({ojsSubmissions.length} Naskah Terintegrasi)
            </span>
          )}
        </div>
        {error && process.env.NEXT_PUBLIC_DEV_MODE !== "true" && ojsSubmissions.length === 0 ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Gagal memuat data naskah. Coba muat ulang halaman.
          </div>
        ) : (
          <ManuscriptDashboard manuscripts={manuscripts} />
        )}
      </main>
      <footer className="mt-auto border-t border-[#DFD9D2] bg-white/80 backdrop-blur-xs">
        <div className="mx-auto flex w-full max-w-[1760px] flex-col items-start justify-between gap-2 px-4 py-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#C13D0D]" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-stone-700">MQC Assistant</strong> · Jurnal Permukiman — Direktorat Bina Teknik Permukiman dan Perumahan, Kementerian PU
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="http://localhost/jurnalpermukiman/index.php/JP"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#A0320A] transition-colors hover:underline"
            >
              Portal OJS Jurnal Permukiman ↗
            </a>
            <Link href="/manuscripts/upload" className="font-medium text-stone-600 transition-colors hover:text-[#A0320A]">
              Unggah Naskah
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
