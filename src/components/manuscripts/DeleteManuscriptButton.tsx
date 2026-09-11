"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteManuscriptButton({ manuscriptId }: { manuscriptId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm("Hapus naskah ini? Naskah tidak akan muncul lagi di dashboard.")) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/manuscripts/${manuscriptId}`, { method: "DELETE" });
      if (!res.ok) {
        window.alert("Gagal menghapus naskah. Coba lagi.");
        setIsDeleting(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      window.alert("Gagal terhubung ke server. Coba lagi.");
      setIsDeleting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-600 shadow-sm transition-[background-color,transform] duration-150 hover:bg-rose-50 active:scale-[0.97] disabled:opacity-60"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9M19.5 5.5h-15m2 0-.001-1.6a2 2 0 0 1 2-2h3.002a2 2 0 0 1 2 2V5.5m-8 0v13a2 2 0 0 0 2 2h6.002a2 2 0 0 0 2-2v-13" />
      </svg>
      {isDeleting ? "Menghapus…" : "Hapus"}
    </button>
  );
}
