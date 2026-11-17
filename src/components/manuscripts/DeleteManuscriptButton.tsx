"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={isDeleting}
      aria-busy={isDeleting}
      className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
    >
      {isDeleting ? (
        <svg
          className="h-4 w-4 animate-spin text-rose-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8H4z"
          />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9M19.5 5.5h-15m2 0-.001-1.6a2 2 0 0 1 2-2h3.002a2 2 0 0 1 2 2V5.5m-8 0v13a2 2 0 0 0 2 2h6.002a2 2 0 0 0 2-2v-13" />
        </svg>
      )}
      <span>{isDeleting ? "Menghapus…" : "Hapus"}</span>
    </Button>
  );
}
