import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "@/components/auth/LoginForm";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-amber-300 via-orange-500 to-rose-600 px-4">
      {/* Decorative warm blobs, purely visual */}
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-rose-300/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-16 top-1/3 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-24 left-1/4 h-96 w-96 rounded-full bg-orange-400/30 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-[2rem] bg-white p-8 shadow-2xl sm:p-10">
          <div className="mb-6 flex flex-col items-center text-center">
            {/* Logo sits on white so its navy/gold colors stay clean against the warm gradient behind the card. */}
            <Image
              src="/logo-pu.png"
              alt="Logo Kementerian Pekerjaan Umum"
              width={64}
              height={64}
              className="rounded-xl"
              priority
            />
            <p className="mt-3 text-sm font-semibold text-slate-900">MQC Assistant</p>
            <p className="text-xs text-slate-500">Jurnal Permukiman</p>
          </div>

          <h1 className="mb-6 text-center text-3xl font-extrabold text-orange-600">Masuk</h1>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
