import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "@/components/auth/LoginForm";

export default async function LoginPage() {
  if (process.env.NEXT_PUBLIC_DEV_MODE !== "true") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/dashboard");
    }
  }

  return (
    <div className="flex min-h-screen flex-col puskim-canvas">
      <div className="h-1.5 w-full bg-gradient-to-r from-[#B93A0C] via-[#C13D0D] to-[#962D08]" />

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="fresh-card grid w-full max-w-4xl overflow-hidden rounded-3xl md:grid-cols-12">
          <div className="flex flex-col justify-between bg-gradient-to-br from-[#B93A0C] via-[#C13D0D] to-[#8C2806] p-8 text-white md:col-span-5 sm:p-10">
            <div>
              <div className="flex items-center gap-3">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white p-2 shadow-md">
                  <Image
                    src="/logo-pu.png"
                    alt="Logo Kementerian Pekerjaan Umum"
                    width={44}
                    height={44}
                    className="object-contain"
                    priority
                  />
                </div>
                <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                  Audit &amp; Mutu
                </span>
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-widest text-white/75">
                Ekosistem Jurnal Permukiman
              </p>
              <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight text-white">
                MQC Assistant
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/85">
                Sistem pemeriksaan otomatis kesesuaian template, struktur naskah, dan validasi
                referensi untuk redaksi dan penulis Jurnal Permukiman.
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-white/90">
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
                  <span>Cek format &amp; template naskah</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
                  <span>Validasi daftar pustaka</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
                  <span>Laporan kepatuhan siap audit</span>
                </li>
              </ul>
            </div>

            <div className="mt-8 border-t border-white/20 pt-4 text-xs text-white/80">
              <p className="font-semibold text-white">Direktorat Bina Teknik Permukiman dan Perumahan</p>
              <div className="mt-2 flex flex-wrap gap-3">
                <a
                  href="http://localhost/jurnalpermukiman/index.php/JP"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
                >
                  Portal OJS ↗
                </a>
                <a
                  href="http://localhost:3001"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
                >
                  JP-Insight ↗
                </a>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center bg-white p-8 md:col-span-7 sm:p-10">
            <div className="mb-6 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="h-5 w-1.5 rounded-full bg-[#C13D0D]" aria-hidden="true" />
                  <h1 className="text-2xl font-bold tracking-tight text-stone-900">Masuk ke MQC Assistant</h1>
                </div>
                <p className="mt-1 text-sm text-stone-500">
                  Gunakan akun editor atau staf redaksi yang terdaftar.
                </p>
              </div>
              <Image
                src="/kemenpu_pill_clean.png"
                alt="Kementerian PU"
                width={116}
                height={28}
                className="hidden h-7 w-auto object-contain sm:block"
              />
            </div>

            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
