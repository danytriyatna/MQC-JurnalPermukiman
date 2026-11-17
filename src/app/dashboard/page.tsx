import { redirect } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/layout/AppHeader";
import ManuscriptDashboard from "@/components/dashboard/ManuscriptDashboard";
import { getStaffSession } from "@/lib/auth/guard";
import { db, manuscripts as manuscriptsTable, manuscriptVersions, users } from "@/db";
import { desc, isNull, eq } from "drizzle-orm";
import { Manuscript, ManuscriptStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getStaffSession();
  if (!session) {
    redirect("/login");
  }

  let manuscriptsList: Manuscript[] = [];
  let dbError = false;

  // 1. Ambil naskah dari PostgreSQL lokal (mqc_db) via Drizzle ORM
  try {
    const localRows = await db
      .select({
        id: manuscriptsTable.id,
        title: manuscriptsTable.title,
        originalFileName: manuscriptsTable.originalFileName,
        activeVersionFileName: manuscriptVersions.originalFileName,
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
      .leftJoin(
        manuscriptVersions,
        eq(manuscriptVersions.id, manuscriptsTable.currentVersionId),
      )
      .where(isNull(manuscriptsTable.deletedAt))
      .orderBy(desc(manuscriptsTable.updatedAt));

    manuscriptsList = localRows.map((r) => ({
      id: r.id,
      title: r.title,
      originalFileName: r.activeVersionFileName || r.originalFileName,
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
      <footer className="mt-auto border-t border-[#DFD9D2] bg-white/80 backdrop-blur-xs">
        <div className="mx-auto flex w-full max-w-[1760px] flex-col items-start justify-between gap-2 px-4 py-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#C13D0D]" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-stone-700">MQC Assistant</strong> · Jurnal Permukiman — Direktorat Bina Teknik Bangunan Gedung dan Penyehatan Lingkungan, Kementerian PU
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="http://localhost/jurnalpermukiman/index.php/JP"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#A0320A] transition-colors hover:underline"
            >
              Portal OJS ↗
            </a>
            <a
              href="http://localhost:3001"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-stone-600 transition-colors hover:text-[#0F2C59]"
            >
              JP-Insight ↗
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
