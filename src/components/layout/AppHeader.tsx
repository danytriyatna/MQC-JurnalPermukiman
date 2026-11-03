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
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md transition-opacity duration-150 hover:opacity-80">
          <Image
            src="/logo-pu.png"
            alt="Logo Kementerian Pekerjaan Umum"
            width={32}
            height={32}
            className="rounded-md"
          />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">MQC Assistant</p>
            <p className="text-xs text-slate-500">Jurnal Permukiman</p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/manuscripts/upload"
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-[background-color,transform] duration-150 hover:bg-slate-800 active:scale-[0.97]"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
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
