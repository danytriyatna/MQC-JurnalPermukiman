"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import UnassignedEditorModal, { UnassignedEditorDetails } from "./UnassignedEditorModal";

interface ScreenNowPendingButtonProps {
  manuscriptId: string;
  versionNumber?: number;
  originalFileName?: string;
}

export default function ScreenNowPendingButton({
  manuscriptId,
  versionNumber,
  originalFileName,
}: ScreenNowPendingButtonProps) {
  const router = useRouter();
  const [isScreening, setIsScreening] = useState(false);
  const [unassignedDetails, setUnassignedDetails] = useState<UnassignedEditorDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const versionText = versionNumber ? `Versi ${versionNumber}` : "";

  const handleScreen = async () => {
    setIsScreening(true);
    try {
      const res = await fetch("/api/manuscripts/screen-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manuscriptIds: [manuscriptId] }),
      });
      const data = await res.json();

      if (res.status === 422 && data.code === "OJS_EDITOR_UNASSIGNED") {
        setUnassignedDetails(data.details);
        setIsModalOpen(true);
        setIsScreening(false);
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal memproses penapisan naskah.");
      }

      toast.success(
        versionText ? `Pemeriksaan ${versionText} Selesai!` : "Pemeriksaan Selesai!",
        {
          description: "Hasil evaluasi format dan dokumen laporan Word resmi berhasil diperbarui.",
        },
      );
      router.refresh();
    } catch (err: any) {
      toast.error("Gagal memeriksa naskah", {
        description: err?.message || "Terjadi kesalahan saat memeriksa naskah.",
      });
      setIsScreening(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={handleScreen}
        disabled={isScreening}
        className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-medium"
      >
        {isScreening ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Memeriksa Naskah {versionText}…
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 1118 0z" />
            </svg>
            Jalankan Pemeriksaan {versionText ? `${versionText} ` : ""}Sekarang
          </>
        )}
      </Button>

      <UnassignedEditorModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        details={unassignedDetails}
      />
    </>
  );
}
