import { redirect } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import UploadForm from "@/components/upload/UploadForm";
import { getStaffSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function UploadManuscriptPage() {
  const session = await getStaffSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <div>
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          <div className="mb-5">
            <h1 className="text-lg font-semibold text-slate-900">Unggah Naskah</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Sistem akan otomatis memeriksa kesesuaian naskah dengan template Jurnal Permukiman.
            </p>
          </div>
          <UploadForm />
        </main>
      </div>

      <footer className="mt-auto border-t border-[#DFD9D2] bg-white/80 backdrop-blur-xs">
        <div className="mx-auto flex w-full max-w-[1760px] flex-col items-start justify-between gap-2 px-4 py-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#C13D0D]" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-stone-700">MQC Assistant</strong> · Jurnal Permukiman — Direktorat
              Bina Teknik Bangunan Gedung dan Penyehatan Lingkungan, Kementerian PU
            </span>
          </div>
          <a
            href="http://localhost/jurnalpermukiman/index.php/JP"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#A0320A] transition-colors hover:underline"
          >
            Portal OJS Jurnal Permukiman ↗
          </a>
        </div>
      </footer>
    </div>
  );
}
