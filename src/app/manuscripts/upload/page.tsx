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
    <div className="min-h-screen bg-slate-50">
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
  );
}
