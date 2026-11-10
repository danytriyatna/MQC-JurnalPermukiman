import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AccountMenu from "./AccountMenu";

export default async function AppHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userName = process.env.NEXT_PUBLIC_DEV_MODE === "true" ? "Dany Triyatna" : "Pengguna";
  const userEmail = user?.email ?? (process.env.NEXT_PUBLIC_DEV_MODE === "true" ? "dany@puskim.pu.go.id" : "");

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
      <div className="mx-auto flex w-full max-w-[1760px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-lg transition-opacity duration-150 hover:opacity-90">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white p-1 shadow-xs">
            <Image
              src="/logo-pu.png"
              alt="Logo Kementerian Pekerjaan Umum"
              width={28}
              height={28}
              className="rounded-sm object-contain"
            />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-bold tracking-tight text-white">MQC Assistant</p>
            <p className="text-[11px] font-medium text-white/80">Jurnal Permukiman</p>
          </div>
        </Link>

        <div className="flex items-center gap-2.5">
          <a
            href="http://localhost/jurnalpermukiman/index.php/JP"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-all duration-150 hover:bg-white/20"
          >
            <span>Portal OJS</span>
            <svg className="h-3.5 w-3.5 opacity-85" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
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

          <AccountMenu userName={userName} userEmail={userEmail} />
        </div>
      </div>
    </header>
  );
}
