import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AccountMenu from "./AccountMenu";

export default async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userName = "Pengguna";
  const userEmail = user?.email ?? "";

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    userName = profile?.full_name ?? userEmail;
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[#8C2806]/60 bg-gradient-to-r from-[#B93A0C] via-[#C13D0D] to-[#962D08] shadow-sm">
      <div className="mx-auto flex w-full max-w-[1760px] items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-lg transition-opacity duration-150 hover:opacity-90">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-xs">
            <Image
              src="/logo-pu.png"
              alt="Logo PU"
              width={28}
              height={28}
              className="rounded-sm object-contain"
              priority
            />
          </div>
          <div className="leading-tight">
            <p className="text-base font-extrabold tracking-tight text-white uppercase">MQC Assistant</p>
            <p className="text-[11px] font-medium tracking-wide text-white/85">Quality Control · Jurnal Permukiman</p>
          </div>
        </Link>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <a
            href="http://localhost:8000/index.php/JP"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-all duration-150 hover:bg-white/20"
          >
            <span>Portal OJS</span>
            <svg className="h-3.5 w-3.5 opacity-85" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
          <a
            href="http://localhost:3001"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-[#FDE68A]/35 bg-[#0F2C59]/65 px-3 py-2 text-xs font-semibold text-white transition-all duration-150 hover:bg-[#0F2C59]/90"
          >
            <span>JP-Insight ↗</span>
          </a>

          <Link
            href="/manuscripts/upload"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-xs sm:text-sm font-bold text-[#A0320A] shadow-xs transition-all duration-150 hover:bg-[#FDF4F0] hover:shadow active:scale-[0.97]"
          >
            <svg
              className="h-4 w-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="hidden sm:inline">Unggah Naskah</span>
          </Link>

          <div className="hidden sm:flex h-9 items-center rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-black/10">
            <Image
              src="/kemenpu_pill_clean.png"
              alt="Kementerian Pekerjaan Umum"
              width={136}
              height={32}
              className="h-7 w-auto object-contain"
              priority
            />
          </div>

          <AccountMenu userName={userName} userEmail={userEmail} />
        </div>
      </div>
    </header>
  );
}
