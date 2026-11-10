import Link from "next/link";
import AppHeader from "@/components/layout/AppHeader";
import UploadForm from "@/components/upload/UploadForm";

const SCREENING_CHECKLIST = [
  {
    title: "Judul, Penulis & Afiliasi",
    desc: "Memeriksa kesesuaian font Cambria, posisi rata tengah, dan kelengkapan afiliasi penulis.",
  },
  {
    title: "Abstrak Indonesia & Inggris",
    desc: "Mengecek batas jumlah kata (200–250 kata), format paragraf, dan keberadaan kata kunci.",
  },
  {
    title: "Margin Halaman & Heading",
    desc: "Validasi margin standar (25 mm), ukuran header/footer (15 mm), serta penomoran sub-bab.",
  },
  {
    title: "Tabel, Gambar & Persamaan",
    desc: "Memastikan posisi caption gambar di bawah, caption tabel di atas, dan penomoran berurutan.",
  },
  {
    title: "Referensi & Sitasi",
    desc: "Mendukung verifikasi daftar pustaka serta kelengkapan tautan DOI / rujukan standar.",
  },
];

export default function UploadManuscriptPage() {
  return (
    <div className="flex min-h-screen flex-col puskim-canvas">
      <AppHeader />
      <main className="mx-auto w-full max-w-[1760px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DFD9D2] bg-white px-3 py-1.5 text-xs font-semibold text-[#A0320A] shadow-xs transition-colors hover:border-[#F4D4C9] hover:bg-[#FDF4F0]"
          >
            <span aria-hidden="true">&larr;</span>
            Kembali ke Antrean &amp; Riwayat Naskah
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="fresh-card rounded-2xl border-t-[3px] border-t-[#C13D0D] p-6">
              <div className="mb-5 flex items-start gap-3">
                <span
                  className="mt-1 h-7 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[#D14715] to-[#8C2806]"
                  aria-hidden="true"
                />
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-stone-900">Unggah Naskah</h1>
                  <p className="mt-0.5 text-sm text-stone-600">
                    Sistem akan otomatis memeriksa kesesuaian dokumen <span className="font-mono text-xs">.docx</span>{" "}
                    dengan template resmi <strong>Jurnal Permukiman</strong>.
                  </p>
                </div>
              </div>
              <UploadForm />
            </div>
          </div>

          <aside className="space-y-5 lg:col-span-4">
            <div className="fresh-card overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-[#EFEAE4] bg-[#FAF8F5]/90 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#C13D0D]" aria-hidden="true" />
                  <h2 className="text-sm font-bold text-stone-900">Komponen yang Diperiksa</h2>
                </div>
                <span className="rounded-full border border-[#F4D4C9] bg-[#FDF4F0] px-2.5 py-0.5 text-[11px] font-semibold text-[#A0320A]">
                  5 bagian
                </span>
              </div>
              <ul className="divide-y divide-[#EFEAE4]">
                {SCREENING_CHECKLIST.map((item) => (
                  <li key={item.title} className="px-5 py-3.5">
                    <p className="text-sm font-semibold text-stone-900">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{item.desc}</p>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </main>

      <footer className="mt-auto border-t border-[#DFD9D2] bg-white/80 backdrop-blur-xs">
        <div className="mx-auto flex w-full max-w-[1760px] flex-col items-start justify-between gap-2 px-4 py-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#C13D0D]" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-stone-700">MQC Assistant</strong> · Jurnal Permukiman — Direktorat
              Bina Teknik Permukiman dan Perumahan, Kementerian PU
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
