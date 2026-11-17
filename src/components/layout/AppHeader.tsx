import Image from "next/image";
import Link from "next/link";
import { getStaffSession } from "@/lib/auth/guard";
import AccountMenu from "./AccountMenu";

export default async function AppHeader() {
  const session = await getStaffSession();
  const userName = session?.name ?? "Penulis OJS";
  const userEmail = session?.email ?? "";

  return (
    <header className="sticky top-0 z-20 border-b border-[#8C2806]/60 bg-gradient-to-r from-[#B93A0C] via-[#C13D0D] to-[#962D08] shadow-sm">
      <div className="mx-auto flex w-full max-w-[1760px] items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex items-center gap-3 rounded-lg transition-opacity duration-150 hover:opacity-90">
          <div className="flex h-9 items-center rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-black/10 shrink-0">
            <Image
              src="/kemenpu_pill_clean.png"
              alt="Kementerian Pekerjaan Umum"
              width={136}
              height={32}
              className="h-7 w-auto object-contain"
              priority
            />
          </div>
          <div className="leading-tight">
            <p className="text-base font-extrabold tracking-tight text-white uppercase">MQC Assistant</p>
            <p className="text-[11px] font-medium tracking-wide text-white/85">Quality Control · Jurnal Permukiman</p>
          </div>
        </Link>

        <div className="flex items-center gap-2.5 sm:gap-3">
          {session ? (
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
          ) : null}

          {session ? (
            <AccountMenu userName={userName} userEmail={userEmail} />
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
            >
              Masuk Staf
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
