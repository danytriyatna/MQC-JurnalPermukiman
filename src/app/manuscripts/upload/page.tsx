import AppHeader from "@/components/layout/AppHeader";
import UploadForm from "@/components/upload/UploadForm";

export default function UploadManuscriptPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#0b2545]/10 text-[#0b2545] border border-[#0b2545]/20">
              MQC Assistant
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#c13d0d]/10 text-[#c13d0d]">
              Gaya Selingkung Jurnal Permukiman
            </span>
          </div>
          <h1 className="text-xl font-bold text-[#0b2545]">Unggah Naskah</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sistem otomatis memeriksa kesesuaian format naskah (.docx) dengan template resmi Jurnal Permukiman sebelum proses telaah editorial.
          </p>
        </div>
        <UploadForm />
      </main>
    </div>
  );
}
